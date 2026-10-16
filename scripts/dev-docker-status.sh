#!/usr/bin/env bash
# Show the state of the Docker dev stack (docker-compose.dev.yml): each container's status and
# health, whether the web and server URLs respond, the server's startup config, and recent errors.
# Usage: ./scripts/dev-docker-status.sh [--watch [seconds]]   (or: pnpm dev:docker:status)

set -euo pipefail

cd "$(dirname "$0")/.."

project=jade-court-dev
services=(mongo deps server web)

watch=false
interval=3
while [[ $# -gt 0 ]]; do
  case "$1" in
    -w | --watch)
      watch=true
      if [[ "${2:-}" =~ ^[0-9]+$ ]]; then
        interval="$2"
        shift
      fi
      ;;
    -h | --help)
      echo "Usage: $0 [--watch [seconds]]"
      echo "  --watch, -w   Refresh every few seconds (default ${interval}) until Ctrl-C"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1 (try --help)" >&2
      exit 1
      ;;
  esac
  shift
done

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  green=$'\e[32m' yellow=$'\e[33m' red=$'\e[31m' dim=$'\e[2m' bold=$'\e[1m' reset=$'\e[0m'
else
  green='' yellow='' red='' dim='' bold='' reset=''
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed." >&2
  exit 1
fi

# Container id for a compose service, or empty when it has never been created.
container_id() {
  docker ps -aq \
    --filter "label=com.docker.compose.project=$project" \
    --filter "label=com.docker.compose.service=$1" | head -n1
}

# Host URL for a published container port, e.g. http://localhost:5173 (empty when unpublished).
host_url() {
  local id="$1" port="$2" scheme="${3:-http}" mapping
  mapping=$(docker port "$id" "$port/tcp" 2>/dev/null | head -n1) || true
  [[ -n "$mapping" ]] && echo "$scheme://localhost:${mapping##*:}"
}

# Prints "<http code>" for a URL, or "down" when nothing answers within 2s.
probe() {
  local code
  code=$(curl -s -o /dev/null -m 2 -w '%{http_code}' "$1" 2>/dev/null) || true
  if [[ -z "$code" || "$code" == "000" ]]; then echo down; else echo "$code"; fi
}

# Last line in the server log matching a pattern, with the pnpm "apps/server dev: " prefix removed.
last_log_line() {
  grep -E "$2" <<<"$1" | tail -n1 | sed -E 's/^[^ ]+ dev: //' || true
}

render() {
  echo "${bold}Jade Court dev stack${reset} ${dim}(project $project, $(date '+%H:%M:%S'))${reset}"
  echo

  if ! docker info >/dev/null 2>&1; then
    echo "${red}✗ Cannot reach the Docker daemon — is Docker running?${reset}"
    return
  fi

  # --- Containers ---
  echo "${bold}Containers${reset}"
  local svc id state health exit_code status mark any=false
  for svc in "${services[@]}"; do
    id=$(container_id "$svc")
    if [[ -z "$id" ]]; then
      printf '  %s %-7s %s\n' "${dim}-" "$svc" "not created${reset}"
      continue
    fi
    any=true
    IFS='|' read -r state health exit_code < <(
      docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.State.ExitCode}}' "$id"
    )
    status=$(docker ps -a --filter "id=$id" --format '{{.Status}}')
    # deps is a one-shot install/build; a clean exit is its success state.
    if [[ "$svc" == deps && "$state" == exited && "$exit_code" == 0 ]]; then
      mark="${green}✓" status="done — $status"
    elif [[ "$state" == running && ( -z "$health" || "$health" == healthy ) ]]; then
      mark="${green}✓"
    elif [[ "$state" == running || "$state" == created || "$state" == restarting ]]; then
      mark="${yellow}…"
    else
      mark="${red}✗"
    fi
    printf '  %s %-7s%s %s\n' "$mark" "$svc" "$reset" "$status"
  done

  if [[ "$any" == false ]]; then
    echo
    echo "Stack is not running. Start it with: ${bold}pnpm dev:docker${reset}"
    return
  fi

  # --- URLs ---
  echo
  echo "${bold}URLs${reset}"
  local web_id server_id mongo_id url code
  web_id=$(container_id web)
  server_id=$(container_id server)
  mongo_id=$(container_id mongo)

  if [[ -n "$web_id" ]] && url=$(host_url "$web_id" 5173); then
    code=$(probe "$url/")
    [[ "$code" == 200 ]] && mark="${green}✓" || mark="${red}✗"
    printf '  %s Web     %s%s  %s\n' "$mark" "$reset" "$url" "${dim}($code)${reset}"
  else
    printf '  %s Web     %s\n' "${dim}-" "not published${reset}"
  fi

  if [[ -n "$server_id" ]] && url=$(host_url "$server_id" 3001); then
    code=$(probe "$url/health")
    [[ "$code" == 200 ]] && mark="${green}✓" || mark="${red}✗"
    printf '  %s Server  %s%s  %s\n' "$mark" "$reset" "$url/health" "${dim}($code)${reset}"
    printf '    WebSocket  %s\n' "$(host_url "$server_id" 3001 ws)/ws"
  else
    printf '  %s Server  %s\n' "${dim}-" "not published${reset}"
  fi

  if [[ -n "$mongo_id" ]] && url=$(host_url "$mongo_id" 27017 mongodb); then
    printf '    MongoDB    %s\n' "$url"
  fi

  # --- Server config (from its startup log) ---
  if [[ -n "$server_id" ]]; then
    local logs line
    logs=$(docker logs "$server_id" 2>&1 || true)
    echo
    echo "${bold}Server config${reset} ${dim}(latest startup log)${reset}"
    local found=false
    for pattern in 'Play opponent:' 'Pikafish:' 'LLM: (enabled|disabled)' 'MongoDB (connected|skipped|connection failed)'; do
      line=$(last_log_line "$logs" "$pattern")
      if [[ -n "$line" ]]; then
        echo "  $line"
        found=true
      fi
    done
    [[ "$found" == false ]] && echo "  ${dim}server has not logged its config yet${reset}"
  fi

  # --- Recent problems ---
  echo
  echo "${bold}Recent errors${reset} ${dim}(last 10 minutes)${reset}"
  local errors clean=true
  for svc in server web; do
    id=$(container_id "$svc")
    [[ -z "$id" ]] && continue
    errors=$(docker logs --since 10m "$id" 2>&1 |
      grep -iE 'error|failed|EADDRINUSE|ELIFECYCLE' | grep -v 'Found 0 errors' | tail -n5 || true)
    if [[ -n "$errors" ]]; then
      clean=false
      echo "  ${red}$svc:${reset}"
      sed 's/^/    /' <<<"$errors"
    fi
  done
  [[ "$clean" == true ]] && echo "  ${green}none${reset}"

  echo
  echo "${dim}Logs: pnpm dev:docker:logs [server|web|mongo]${reset}"
}

if [[ "$watch" == true ]]; then
  trap 'exit 0' INT TERM
  while true; do
    # Render first, then clear and print in one go so the screen doesn't flicker.
    frame=$(render)
    printf '\e[H\e[2J%s\n' "$frame"
    echo "${dim}Refreshing every ${interval}s — Ctrl-C to stop${reset}"
    sleep "$interval"
  done
else
  render
fi
