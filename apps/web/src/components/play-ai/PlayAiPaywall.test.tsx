import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayAiPaywall } from './PlayAiPaywall';

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation((input) => {
    const url = String(input);
    if (url.includes('/api/ai/models')) {
      return Promise.resolve(
        json({ models: [{ id: 'm1', label: 'Gemini Flash' }], defaultId: 'm1' }),
      );
    }
    return Promise.resolve(json({}));
  });
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('PlayAiPaywall', () => {
  it('shows model chips and Buy day pass CTA', async () => {
    render(<PlayAiPaywall emailVerified hasEmail />);
    await waitFor(() => {
      expect(screen.getByText('Gemini Flash')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Buy day pass · \$1/i })).toBeEnabled();
    expect(screen.getByText(/JADE COURT on your statement/i)).toBeInTheDocument();
  });

  it('disables buy when email is not verified', () => {
    render(<PlayAiPaywall emailVerified={false} hasEmail />);
    expect(screen.getByRole('button', { name: /Buy day pass/i })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/Verify your email/i);
  });

  it('disables buy when account has no email', () => {
    render(<PlayAiPaywall emailVerified hasEmail={false} />);
    expect(screen.getByRole('button', { name: /Buy day pass/i })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/Add an email/i);
  });
});
