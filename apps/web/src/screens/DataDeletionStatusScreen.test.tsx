import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { DataDeletionStatusScreen } from './DataDeletionStatusScreen';

const VALID_CODE = 'a1b2c3d4e5f6789012345678abcdef01';

function renderStatus(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/account/data-deletion" element={<DataDeletionStatusScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DataDeletionStatusScreen', () => {
  it('shows confirmation code from query param', () => {
    renderStatus(`/account/data-deletion?code=${VALID_CODE}`);
    expect(screen.getByTestId('data-deletion-confirmation-code')).toHaveTextContent(VALID_CODE);
    expect(screen.getByRole('heading', { name: /Data deletion request/i })).toBeInTheDocument();
  });

  it('shows alert when code param is missing', () => {
    renderStatus('/account/data-deletion');
    expect(screen.getByRole('alert')).toHaveTextContent(/missing a valid confirmation code/i);
    expect(screen.queryByTestId('data-deletion-confirmation-code')).not.toBeInTheDocument();
  });

  it('shows alert when code param is malformed (broken backend URL)', () => {
    renderStatus('/account/data-deletion?code=broken-not-hex');
    expect(screen.getByRole('alert')).toHaveTextContent(/does not look valid/i);
    expect(screen.queryByTestId('data-deletion-confirmation-code')).not.toBeInTheDocument();
  });
});
