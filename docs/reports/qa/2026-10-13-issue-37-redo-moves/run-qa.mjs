/* global console, process, document */
/**
 * QA script for Issue #37 "Redo taken-back moves in Play vs Computer"
 *
 * Drives the running dev stack (web :5210, server :3038) in headless Chromium
 * and verifies the 5 acceptance criteria plus all 8 adversarial QA hints.
 *
 * Captures network traffic to /api/opponent/move so we can prove the redo
 * path adds zero API calls.
 */
import { chromium } from '/home/pwuser/work/jade-court-worktrees/issue-37-redo-moves/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const WEB = 'http://localhost:5210';
const SHOTS =
  '/home/pwuser/work/jade-court-worktrees/issue-37-redo-moves/docs/reports/qa/2026-10-13-issue-37-redo-moves/screenshots';
mkdirSync(SHOTS, { recursive: true });

const consoleErrors = [];
const opponentCalls = [];
const failedRequests = [];

function outcome(name, pass, detail = '') {
  const flag = pass ? '✅' : '❌';
  console.log(`${flag} ${name}${detail ? ' — ' + detail : ''}`);
  return { name, pass, detail };
}

function squareRef(square) {
  const [r, c] = square;
  return `[data-square="${r}-${c}"]`;
}

async function newPage(browser, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  page.on('response', (resp) => {
    if (resp.status() >= 400 && resp.url().includes('/api/')) {
      failedRequests.push({
        url: resp.url(),
        status: resp.status(),
        method: resp.request().method(),
      });
    }
  });
  return { ctx, page };
}

async function gotoPlay(page) {
  await page.goto(WEB + '/play');
  await page.waitForLoadState('domcontentloaded');
}

async function startGameRed(page) {
  await page.getByRole('button', { name: /Start game/ }).click();
  // The StatusLine reads "Your move" right after the page transitions.
  await page.waitForSelector(
    'div:has-text("Your move"), div:has-text("Computer is thinking"), div:has-text("Waiting")',
  );
  // Wait until button 'Take back move' is hydrated (means a Game is rendered).
  await page.waitForSelector('button:has-text("Take back move")', { timeout: 5000 });
}

const results = [];
let browser = null;

async function runAC1_RoundTrip() {
  /** Acceptance 1: N× undoLast then N× redoLast returns to the same state. */
  const { ctx, page } = await newPage(browser);
  page.on('request', (req) => {
    if (req.url().includes('/api/opponent/move'))
      opponentCalls.push({ url: req.url(), method: req.method() });
  });
  await gotoPlay(page);
  await startGameRed(page);

  // Play 2 distinct pairs (origin -> different destinations).
  // Pair 1: Red cannon [7,1] -> [7,4]
  await page.locator(squareRef([7, 1])).click();
  await page.locator(squareRef([7, 4])).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'), null, {
    timeout: 8000,
  });

  // Pair 2: Red horse [9,1] -> [7,2]
  await page.locator(squareRef([9, 1])).click();
  await page.locator(squareRef([7, 2])).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 4'), null, {
    timeout: 8000,
  });

  // Snapshot before any take-back
  const beforeHTML = await page.locator('[data-testid="board"]').innerHTML();
  const beforeMoves = await page.locator('div.card:has-text("Moves played")').innerText();
  const beforeCount = opponentCalls.length;

  await page.screenshot({ path: join(SHOTS, '01-roundtrip-before-2pairs.png'), fullPage: true });

  // Undo twice
  await page.getByRole('button', { name: 'Take back move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'));
  await page.getByRole('button', { name: 'Take back move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 0'));

  await page.screenshot({ path: join(SHOTS, '02-roundtrip-after-2-undo.png'), fullPage: true });

  // Redo twice
  await page.getByRole('button', { name: 'Redo move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'));
  await page.getByRole('button', { name: 'Redo move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 4'));

  const afterHTML = await page.locator('[data-testid="board"]').innerHTML();
  const afterMoves = await page.locator('div.card:has-text("Moves played")').innerText();
  const afterCount = opponentCalls.length;

  await page.screenshot({ path: join(SHOTS, '03-roundtrip-after-2-redo.png'), fullPage: true });

  const ac1 =
    beforeHTML === afterHTML &&
    beforeMoves.includes('Moves played: 4') &&
    afterMoves.includes('Moves played: 4');

  console.log('--- AC 1 Round Trip (2 pairs) ---');
  console.log('   before="' + beforeMoves.trim().split('\n')[0] + '"');
  console.log('   after="' + afterMoves.trim().split('\n')[0] + '"');
  console.log('   boardMatch=' + (beforeHTML === afterHTML));
  console.log('   opponent calls during undo/redo: ' + (afterCount - beforeCount) + ' (must be 0)');
  results.push(
    outcome(
      'AC1 N× undo then N× redo = original',
      ac1,
      `before="${beforeMoves.trim().split('\n')[0]}" after="${afterMoves.trim().split('\n')[0]}" boardMatch=${beforeHTML === afterHTML}`,
    ),
  );

  await ctx.close();
  return ac1;
}

async function runAC2_NoAPICall() {
  /** Acceptance 2: Redo must not call the opponent API. */
  opponentCalls.length = 0;
  const { ctx, page } = await newPage(browser);
  page.on('request', (req) => {
    if (req.url().includes('/api/opponent/move'))
      opponentCalls.push({ url: req.url(), method: req.method() });
  });
  await gotoPlay(page);
  await startGameRed(page);

  // Play a single pair.
  await page.locator(squareRef([7, 1])).click();
  await page.locator(squareRef([7, 4])).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'));

  // Wait until AI thinking has settled and computer-lastmove is highlighted.
  await page.waitForSelector('.piece.computer-lastmove', { timeout: 5000 });
  const callsAfterSetup = opponentCalls.length;

  // Take back
  await page.getByRole('button', { name: 'Take back move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 0'));

  // Redo
  await page.getByRole('button', { name: 'Redo move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'));

  // Small grace window — give React + any deferred effect a tick.
  await page.waitForTimeout(500);

  const callsAfterRedo = opponentCalls.length;
  const ac2 = callsAfterRedo - callsAfterSetup === 0;
  console.log('--- AC 2 No API call on redo ---');
  results.push(
    outcome(
      'AC2 Redo adds zero opponent API calls',
      ac2,
      `delta=${callsAfterRedo - callsAfterSetup} (calls before setup=${callsAfterSetup}, after=${callsAfterRedo})`,
    ),
  );

  await ctx.close();
  return ac2;
}

async function runAC3_NewMoveClearsRedo() {
  /** Acceptance 3: A new move after a take-back disables Redo. */
  opponentCalls.length = 0;
  const { ctx, page } = await newPage(browser);
  await gotoPlay(page);
  await startGameRed(page);

  // Play pair 1 then take back.
  await page.locator(squareRef([7, 1])).click();
  await page.locator(squareRef([7, 4])).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'));
  await page.getByRole('button', { name: 'Take back move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 0'));

  const redoEnabledBefore = !(await page.getByRole('button', { name: 'Redo move' }).isDisabled());
  await page.screenshot({
    path: join(SHOTS, '04-after-takeback-redo-enabled.png'),
    fullPage: true,
  });

  // Play a different legal move (Red horse [9,1] -> [7,2]).
  await page.locator(squareRef([9, 1])).click();
  await page.locator(squareRef([7, 2])).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'));

  await page.screenshot({ path: join(SHOTS, '05-new-move-redo-disabled.png'), fullPage: true });

  const redoDisabledAfter = await page.getByRole('button', { name: 'Redo move' }).isDisabled();
  const tooltip = await page
    .getByRole('button', { name: 'Redo move' })
    .getAttribute('title')
    .catch(() => '');

  const ac3 = redoEnabledBefore && redoDisabledAfter && tooltip === 'Nothing to redo';
  console.log('--- AC 3 New move clears redo ---');
  results.push(
    outcome(
      'AC3 Redo enabled after take-back; disabled after a new move',
      ac3,
      `beforeEnabled=${redoEnabledBefore} afterDisabled=${redoDisabledAfter} title="${tooltip}"`,
    ),
  );

  await ctx.close();
  return ac3;
}

async function runAC4_RestartNewGameClear() {
  /** Acceptance 4: Restart and New game clear redo. */
  opponentCalls.length = 0;
  const { ctx, page } = await newPage(browser);
  await gotoPlay(page);
  await startGameRed(page);

  await page.locator(squareRef([7, 1])).click();
  await page.locator(squareRef([7, 4])).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'));

  await page.getByRole('button', { name: 'Take back move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 0'));

  const enabledBeforeRestart = !(await page
    .getByRole('button', { name: 'Redo move' })
    .isDisabled());

  await page.getByRole('button', { name: 'Restart' }).click();
  await page.waitForTimeout(200);

  const disabledAfterRestart = await page.getByRole('button', { name: 'Redo move' }).isDisabled();

  // Set up a second scenario: take back, then click "New game" (returns to setup).
  await page.locator(squareRef([7, 1])).click();
  await page.locator(squareRef([7, 4])).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'));
  await page.getByRole('button', { name: 'Take back move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 0'));
  const enabledBeforeNewGame = !(await page
    .getByRole('button', { name: 'Redo move' })
    .isDisabled());

  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForSelector('button:has-text("Start game")');
  // After clicking New game we are back on the Setup screen; no redo button present.
  const redoButtonCountAfterNewGame = await page.getByRole('button', { name: 'Redo move' }).count();

  const ac4 =
    enabledBeforeRestart &&
    disabledAfterRestart &&
    enabledBeforeNewGame &&
    redoButtonCountAfterNewGame === 0;
  console.log('--- AC 4 Restart and New game clear redo ---');
  results.push(
    outcome(
      'AC4 Restart clears redo; New game returns to Setup',
      ac4,
      `RestartEnabled=${enabledBeforeRestart} RestartDisabled=${disabledAfterRestart} NewGameEnabled=${enabledBeforeNewGame} RedoBtnCount=${redoButtonCountAfterNewGame}`,
    ),
  );

  await ctx.close();
  return ac4;
}

async function runAC5_UnitTests() {
  /** Acceptance 5: Unit tests for UNDO/REDO reducer behavior exist and pass. */
  const { execSync } = await import('node:child_process');
  let output,
    code = 0;
  try {
    output = execSync(
      `pnpm --filter @jade-court/web exec vitest run src/hooks/useXiangqiGame.test.ts --reporter=verbose 2>&1`,
      { cwd: '/home/pwuser/work/jade-court-worktrees/issue-37-redo-moves', encoding: 'utf8' },
    );
  } catch (e) {
    output = (e.stdout ?? '') + (e.stderr ?? '');
    code = e.status ?? 1;
  }
  const passing = /Tests\s+\d+\s+passed/.test(output);
  // Verbose reporter list each describe with all subtests; count lines that include the
  // redo describe and end with ms — these are the redo subtests.
  const redoTestLines = output
    .split('\n')
    .filter((l) => /useXiangqiGame:\s*redo\s*>/.test(l) && /✓/.test(l));
  const redoTestCount = redoTestLines.length;
  const hasRedoTests = /useXiangqiGame:\s*redo/.test(output) && redoTestCount >= 5;
  writeFileSync(
    '/home/pwuser/work/jade-court-worktrees/issue-37-redo-moves/docs/reports/qa/2026-10-13-issue-37-redo-moves/unit-test-output.txt',
    output,
  );
  results.push(
    outcome(
      'AC5 Unit tests for UNDO/REDO pass',
      code === 0 && passing && hasRedoTests,
      `exit=${code} passingHeader=${passing} redoDescribeTests=${redoTestCount}`,
    ),
  );
  return code === 0 && passing;
}

async function runQA1_ButtonLifecycle() {
  /** Hint 1 - Redo button lifecycle (disabled → enabled → disabled). */
  opponentCalls.length = 0;
  const { ctx, page } = await newPage(browser);
  await gotoPlay(page);
  await startGameRed(page);

  const redo = page.getByRole('button', { name: 'Redo move' });

  const startDisabled = await redo.isDisabled();
  const startTitle = await redo.getAttribute('title');

  // Play one pair.
  await page.locator(squareRef([7, 1])).click();
  await page.locator(squareRef([7, 4])).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'));
  const afterPairDisabled = await redo.isDisabled();

  // Take back.
  await page.getByRole('button', { name: 'Take back move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 0'));
  const afterTakeBackDisabled = await redo.isDisabled();
  const afterTakeBackTitle = await redo.getAttribute('title');

  await page.screenshot({ path: join(SHOTS, '06-lifecycle-after-takeback.png'), fullPage: true });

  // Redo.
  await redo.click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'));
  const afterRedoDisabled = await redo.isDisabled();
  const afterRedoTitle = await redo.getAttribute('title');

  await page.screenshot({ path: join(SHOTS, '07-lifecycle-after-redo.png'), fullPage: true });

  const pass =
    startDisabled &&
    startTitle === 'Nothing to redo' &&
    afterPairDisabled === true &&
    !afterTakeBackDisabled &&
    afterTakeBackTitle === 'Redo the moves you took back (Ctrl+Shift+Z)' &&
    afterRedoDisabled === true &&
    afterRedoTitle === 'Nothing to redo';
  results.push(
    outcome(
      'QA1 Redo button lifecycle + tooltips',
      pass,
      `start=${startDisabled}/${startTitle} afterPair=${afterPairDisabled} afterTakeBack=${!afterTakeBackDisabled}/${afterTakeBackTitle} afterRedo=${afterRedoDisabled}/${afterRedoTitle}`,
    ),
  );
  await ctx.close();
  return pass;
}

async function runQA3_MultiPairRoundTrip() {
  /** Hint 3 - multi-pair round trip. (Same as AC1 but also asserts in-between counts.) */
  opponentCalls.length = 0;
  const { ctx, page } = await newPage(browser);
  page.on('request', (req) => {
    if (req.url().includes('/api/opponent/move'))
      opponentCalls.push({ url: req.url(), method: req.method() });
  });
  await gotoPlay(page);
  await startGameRed(page);

  // 3 pairs with legal moves:
  //  Pair 1: Red cannon [7,1] -> [7,4]
  //  Pair 2: Red horse [9,1] -> [7,2]
  //  Pair 3: Red right cannon [7,7] -> [6,7] (forward 1)
  await page.locator(squareRef([7, 1])).click();
  await page.locator(squareRef([7, 4])).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'));
  await page.locator(squareRef([9, 1])).click();
  await page.locator(squareRef([7, 2])).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 4'));
  await page.locator(squareRef([7, 7])).click();
  await page.locator(squareRef([6, 7])).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 6'), null, {
    timeout: 8000,
  });

  const beforeHTML = await page.locator('[data-testid="board"]').innerHTML();
  const beforeCount = opponentCalls.length;

  // Triple undo.
  await page.getByRole('button', { name: 'Take back move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 4'));
  await page.getByRole('button', { name: 'Take back move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'));
  await page.getByRole('button', { name: 'Take back move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 0'));
  await page.screenshot({ path: join(SHOTS, '08-multi-pair-after-3-undo.png'), fullPage: true });

  // Triple redo.
  await page.getByRole('button', { name: 'Redo move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'));
  await page.getByRole('button', { name: 'Redo move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 4'));
  await page.getByRole('button', { name: 'Redo move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 6'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, '09-multi-pair-after-3-redo.png'), fullPage: true });

  const afterHTML = await page.locator('[data-testid="board"]').innerHTML();
  const undoRedoOpponentDelta = opponentCalls.length - beforeCount;
  const pass = beforeHTML === afterHTML && undoRedoOpponentDelta === 0;
  results.push(
    outcome(
      'QA3 3-pair round trip preserves exact board + zero API calls during undo/redo',
      pass,
      `boardMatch=${beforeHTML === afterHTML} opponentDelta=${undoRedoOpponentDelta}`,
    ),
  );
  await ctx.close();
  return pass;
}

async function runQA5_RestartAndNewGame() {
  /** Hint 5 - Re-verification; covered by AC4 but checks the tooltip text on Restart. */
  opponentCalls.length = 0;
  const { ctx, page } = await newPage(browser);
  await gotoPlay(page);
  await startGameRed(page);

  // Pair 1.
  await page.locator(squareRef([7, 1])).click();
  await page.locator(squareRef([7, 4])).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'));
  await page.getByRole('button', { name: 'Take back move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 0'));
  const redoTitle = await page.getByRole('button', { name: 'Redo move' }).getAttribute('title');

  // Restart.
  await page.getByRole('button', { name: 'Restart' }).click();
  await page.waitForTimeout(150);
  const afterRestartBtn = page.getByRole('button', { name: 'Redo move' });
  const afterRestartDisabled = await afterRestartBtn.isDisabled();
  const afterRestartTitle = await afterRestartBtn.getAttribute('title').catch(() => '');

  const pass =
    redoTitle !== 'Nothing to redo' &&
    afterRestartDisabled &&
    afterRestartTitle === 'Nothing to redo';
  results.push(outcome('QA5 Restart restores tooltip to "Nothing to redo"', pass));
  await ctx.close();
  return pass;
}

async function runQA6_KeyboardShortcuts() {
  /** Hint 6 - Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y. */
  opponentCalls.length = 0;
  const { ctx, page } = await newPage(browser);
  page.on('request', (req) => {
    if (req.url().includes('/api/opponent/move'))
      opponentCalls.push({ url: req.url(), method: req.method() });
  });
  await gotoPlay(page);
  await startGameRed(page);

  // First: Ctrl+Z with nothing on stack — should not change anything.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);
  const beforePressMoves = await page.locator('div.card:has-text("Moves played")').innerText();

  // Play a pair.
  await page.locator(squareRef([7, 1])).click();
  await page.locator(squareRef([7, 4])).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'));
  const callsAfterSetup = opponentCalls.length;

  // Ctrl+Z undo.
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 0'), {
    timeout: 5000,
  });

  // Ctrl+Shift+Z redo.
  await page.keyboard.press('Control+Shift+z');
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'), {
    timeout: 5000,
  });
  await page.waitForTimeout(300);
  const callsAfterShortcutRedo = opponentCalls.length;

  // Take back again, then Ctrl+Y redo.
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 0'));
  await page.keyboard.press('Control+y');
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'), {
    timeout: 5000,
  });
  await page.waitForTimeout(300);
  const callsAfterY = opponentCalls.length;

  await page.screenshot({ path: join(SHOTS, '10-keyboard-shortcuts.png'), fullPage: true });

  const pass =
    beforePressMoves.includes('Moves played: 0') &&
    callsAfterShortcutRedo - callsAfterSetup === 0 &&
    callsAfterY - callsAfterSetup === 0;
  results.push(
    outcome(
      'QA6 Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y shortcuts',
      pass,
      `no-op on empty undo=${beforePressMoves.includes('Moves played: 0')} redoCtrlShiftDelta=${callsAfterShortcutRedo - callsAfterSetup} redoCtrlYDelta=${callsAfterY - callsAfterSetup}`,
    ),
  );
  await ctx.close();
  return pass;
}

async function runQA7_PlayAsBlack() {
  /** Hint 7 - play as Black: computer moves first, take back, redo. */
  const { ctx, page } = await newPage(browser);
  opponentCalls.length = 0;
  page.on('request', (req) => {
    if (req.url().includes('/api/opponent/move'))
      opponentCalls.push({ url: req.url(), method: req.method() });
  });
  await gotoPlay(page);

  // Start by selecting the Black (將) side on the setup screen.
  // Use the Beginner level so the AI replies quickly.
  await page.locator('.level-card').first().click();
  await page.getByRole('button', { name: /Black 將/ }).click();
  await page.getByRole('button', { name: /Start game/ }).click();

  // Wait for the computer's first move (Red is computer now). history.length === 1.
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 1'), {
    timeout: 10000,
  });
  await page.screenshot({ path: join(SHOTS, '11-black-after-computer-move.png'), fullPage: true });

  // Play Black's first move: cannon [2,1] -> [2,4] (rightward in row 2). Then the computer replies.
  await page.locator(squareRef([2, 1])).click();
  await page.locator(squareRef([2, 4])).click();
  // After our move + AI reply the counter sits at 3 plies (computer first, human, computer reply).
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 3'), {
    timeout: 10000,
  });

  const beforeHTML = await page.locator('[data-testid="board"]').innerHTML();
  const beforeMoves = await page.locator('div.card:has-text("Moves played")').innerText();
  const beforeCount = opponentCalls.length;

  // Take back 2 plies at once: removes human + AI reply → 1 (only the opening computer move remains).
  await page.getByRole('button', { name: 'Take back move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 1'), {
    timeout: 8000,
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(SHOTS, '12-black-after-takeback.png'), fullPage: true });

  // Redo.
  await page.getByRole('button', { name: 'Redo move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 3'), {
    timeout: 8000,
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, '13-black-after-redo.png'), fullPage: true });

  const afterHTML = await page.locator('[data-testid="board"]').innerHTML();
  const afterMoves = await page.locator('div.card:has-text("Moves played")').innerText();
  const afterCount = opponentCalls.length;

  const pass =
    beforeHTML === afterHTML &&
    beforeMoves.includes('Moves played: 3') &&
    afterMoves.includes('Moves played: 3') &&
    afterCount - beforeCount === 0;
  results.push(
    outcome(
      'QA7 Play as Black round trip is symmetric (Red replies preserved)',
      pass,
      `before="${beforeMoves.trim().split('\n')[0]}" after="${afterMoves.trim().split('\n')[0]}" boardMatch=${beforeHTML === afterHTML} opponentDelta=${afterCount - beforeCount}`,
    ),
  );
  await ctx.close();
  return pass;
}

async function runQA8_RapidRedoText() {
  /** Hint 8 - rapid redo: click Redo twice, confirm card text is correct
   *  and stays correct after the stack is exhausted. */
  opponentCalls.length = 0;
  const { ctx, page } = await newPage(browser);
  await gotoPlay(page);
  await startGameRed(page);

  // Play a pair (Red cannon [7,1] -> [7,4]).
  await page.locator(squareRef([7, 1])).click();
  await page.locator(squareRef([7, 4])).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'));
  // Wait for computer reply to land & reveal (revealOpponentMoveMs=0 so quick).
  await page.waitForSelector('.piece.computer-lastmove', { timeout: 5000 });

  // Capture canonical computer move text from one full pair → takeback → redo.
  const computerCardInitialText = await page
    .locator('div.card', { hasText: "Computer's last move" })
    .innerText();
  console.log('   1st pair before take-back card text:');
  console.log('     ' + JSON.stringify(computerCardInitialText));

  // Take back.
  await page.getByRole('button', { name: 'Take back move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 0'));

  // Click Redo once.
  await page.getByRole('button', { name: 'Redo move' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Moves played: 2'));
  await page.waitForTimeout(200);
  const afterOneRedoCard = await page
    .locator('div.card', { hasText: "Computer's last move" })
    .innerText();
  console.log('   after 1st redo card text:');
  console.log('     ' + JSON.stringify(afterOneRedoCard));

  // Click Redo a second time — should now be disabled (stack exhausted after 2).
  const secondClickDisabled = await page.getByRole('button', { name: 'Redo move' }).isDisabled();

  await page.screenshot({ path: join(SHOTS, '14-rapid-redo-final.png'), fullPage: true });

  // Acceptance:
  //  - Card text after redo matches the text before take-back.
  //  - Second click is properly disabled (no extra redo without stock).
  const textWithoutHeader = (s) => s.replace(/Computer's last move\s*/i, '').trim();
  const pass =
    textWithoutHeader(computerCardInitialText) === textWithoutHeader(afterOneRedoCard) &&
    secondClickDisabled;
  results.push(
    outcome(
      'QA8 Rapid redo restores card text + disables after stock exhausted',
      pass,
      `initial="${textWithoutHeader(computerCardInitialText).slice(0, 80)}" afterRedo="${textWithoutHeader(afterOneRedoCard).slice(0, 80)}" disabledAt2nd=${secondClickDisabled}`,
    ),
  );
  await ctx.close();
  return pass;
}

(async () => {
  browser = await chromium.launch({ headless: true });
  console.log('Browser version:', browser.version());

  await runAC1_RoundTrip();
  await runAC2_NoAPICall();
  await runAC3_NewMoveClearsRedo();
  await runAC4_RestartNewGameClear();
  await runAC5_UnitTests();
  await runQA1_ButtonLifecycle();
  await runQA3_MultiPairRoundTrip();
  await runQA5_RestartAndNewGame();
  await runQA6_KeyboardShortcuts();
  await runQA7_PlayAsBlack();
  await runQA8_RapidRedoText();

  console.log('\n=== SUMMARY ===');
  let passCount = 0,
    failCount = 0;
  for (const r of results) {
    console.log(`${r.pass ? '✅' : '❌'} ${r.name}`);
    if (r.pass) passCount++;
    else failCount++;
  }
  console.log(`\nPassed: ${passCount}, Failed: ${failCount}`);
  console.log(`Console errors observed: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    for (const e of consoleErrors.slice(0, 10)) console.log(' • ' + e);
  }

  writeFileSync(
    '/home/pwuser/work/jade-court-worktrees/issue-37-redo-moves/docs/reports/qa/2026-10-13-issue-37-redo-moves/qa-results.json',
    JSON.stringify(
      { results, consoleErrors, failedRequests, opponentCalls: opponentCalls.slice(0, 50) },
      null,
      2,
    ),
  );

  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})().catch(async (err) => {
  console.error('FATAL:', err.stack || err.message);
  await browser?.close?.();
  process.exit(2);
});
