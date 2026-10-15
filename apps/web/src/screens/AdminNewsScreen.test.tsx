import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBLISH_REQUIREMENTS_MESSAGE } from '../lib/adminNewsForm';
import { setAdminSession } from '../lib/adminApi';
import { type AdminNewsItem } from '../lib/newsApi';
import { AdminNewsScreen } from './AdminNewsScreen';

const onUnauthorizedMock = vi.fn();

vi.mock('../admin/AdminSessionContext', () => ({
  useAdminSession: () => ({
    username: 'test-admin',
    onUnauthorized: onUnauthorizedMock,
  }),
}));

const fetchMock = vi.fn<typeof fetch>();

const futureExpiry = () => new Date(Date.now() + 60_000).toISOString();

function seedSession() {
  setAdminSession({ token: 'tok', username: 'test-admin', expiresAt: futureExpiry() });
}

const adminItem: AdminNewsItem = {
  id: 'existing-1',
  sourceUrl: 'https://example.com/story',
  normalizedUrl: 'https://example.com/story',
  title: 'Existing title',
  summary: 'Existing summary with enough words for publish validation rules.',
  publisher: 'Pub',
  sourceDomain: 'example.com',
  sortAt: '2026-10-01T12:00:00.000Z',
  tags: ['culture'],
  status: 'draft',
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function adminListResponse(items: AdminNewsItem[] = [adminItem]) {
  return json({ items, nextCursor: null });
}

const uploadedThumbPath = '/api/news/images/550e8400-e29b-41d4-a716-446655440000.png';

function mockAdminFetch(handlers: {
  listItems?: AdminNewsItem[];
  preview?: unknown;
  postCreate?: unknown;
  postError?: { body: unknown; status: number };
  patchError?: { body: unknown; status: number };
  imageUpload?: { imageUrl: string } | 'fail';
  imageUploadError?: { body: unknown; status: number };
}) {
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = String(url);
    if (path.includes('/api/admin/news/images') && method === 'POST') {
      if (handlers.imageUploadError) {
        return Promise.resolve(
          json(handlers.imageUploadError.body, handlers.imageUploadError.status),
        );
      }
      if (handlers.imageUpload === 'fail') {
        return Promise.resolve(json({ error: 'invalid_image' }, 400));
      }
      return Promise.resolve(json(handlers.imageUpload ?? { imageUrl: uploadedThumbPath }, 201));
    }
    if (path.includes('/preview') && method === 'POST') {
      if (handlers.preview === 'fail') {
        return Promise.resolve(json({ error: 'fetch_failed' }, 502));
      }
      return Promise.resolve(json(handlers.preview));
    }
    if (method === 'GET' && path.includes('/api/admin/news')) {
      return Promise.resolve(adminListResponse(handlers.listItems ?? [adminItem]));
    }
    if (method === 'POST' && path.includes('/api/admin/news')) {
      if (handlers.postError) {
        return Promise.resolve(json(handlers.postError.body, handlers.postError.status));
      }
      return Promise.resolve(json(handlers.postCreate ?? { ...adminItem, id: 'new-draft' }, 201));
    }
    if (method === 'DELETE') {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (method === 'PATCH') {
      if (handlers.patchError) {
        return Promise.resolve(json(handlers.patchError.body, handlers.patchError.status));
      }
      return Promise.resolve(json(adminItem));
    }
    return Promise.resolve(json({ error: 'not_found' }, 404));
  });
}

function renderAdmin() {
  return render(
    <MemoryRouter initialEntries={['/admin/news']}>
      <Routes>
        <Route path="/admin/news" element={<AdminNewsScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.setItem('jade-court-guest-id', 'guest');
  sessionStorage.clear();
  onUnauthorizedMock.mockReset();
  seedSession();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('AdminNewsScreen', () => {
  it('lists items when authenticated', async () => {
    mockAdminFetch({ listItems: [adminItem] });
    renderAdmin();
    expect(await screen.findByText('Existing title')).toBeInTheDocument();
  });

  it('calls onUnauthorized on 401 from list', async () => {
    fetchMock.mockResolvedValue(json({ error: 'unauthorized' }, 401));
    renderAdmin();
    await waitFor(() => expect(onUnauthorizedMock).toHaveBeenCalled());
  });

  it('prefills from preview and shows duplicate warning', async () => {
    mockAdminFetch({
      listItems: [],
      preview: {
        title: 'Fetched title',
        description: 'Fetched description with enough length for later.',
        imageUrl: 'https://cdn.example/i.jpg',
        publisher: 'Fetched Pub',
        publishedAt: '2026-10-05',
        canonicalUrl: 'https://example.com/new',
        duplicateOf: { id: 'existing-1', title: 'Existing title', status: 'draft' },
      },
    });
    renderAdmin();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    await userEvent.type(screen.getByLabelText('Source URL'), 'https://example.com/new');
    await userEvent.click(screen.getByRole('button', { name: 'Fetch details' }));
    expect(await screen.findByDisplayValue('Fetched title')).toBeInTheDocument();
    expect(screen.getByText(/may duplicate/)).toBeInTheDocument();
  });

  it('shows manual fallback when preview fails', async () => {
    mockAdminFetch({ listItems: [], preview: 'fail' });
    renderAdmin();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    await userEvent.type(screen.getByLabelText('Source URL'), 'https://example.com/x');
    await userEvent.click(screen.getByRole('button', { name: 'Fetch details' }));
    expect(await screen.findByText(/fill them in manually/)).toBeInTheDocument();
  });

  it('validates draft vs publish client-side', async () => {
    mockAdminFetch({ listItems: [] });
    renderAdmin();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText(/Title must be/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Source URL'), 'https://example.com/only-url');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument(),
    );
  });

  it('shows server validation field errors inline', async () => {
    mockAdminFetch({
      listItems: [],
      postError: { body: { error: 'validation', fields: { summary: 'Too short' } }, status: 400 },
    });
    renderAdmin();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    await userEvent.type(screen.getByLabelText('Source URL'), 'https://example.com/x');
    await userEvent.type(screen.getByLabelText('Title'), 'Valid title here');
    await userEvent.type(
      screen.getByLabelText(/Summary/),
      'Valid summary written in our own words for publish.',
    );
    await userEvent.type(screen.getByLabelText('Publisher'), 'Pub');
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Too short')).toBeInTheDocument();
  });

  it('shows server field errors and 409 edit link', async () => {
    mockAdminFetch({
      listItems: [adminItem],
      postError: {
        body: {
          error: 'duplicate',
          existing: { id: 'existing-1', title: 'Existing title', status: 'draft' },
        },
        status: 409,
      },
    });
    renderAdmin();
    await waitFor(() => expect(screen.getByText('Existing title')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    await userEvent.type(screen.getByLabelText('Source URL'), 'https://example.com/story');
    await userEvent.type(screen.getByLabelText('Title'), 'New title here for publish');
    await userEvent.type(
      screen.getByLabelText(/Summary/),
      'A unique summary written in our own words for the story.',
    );
    await userEvent.type(screen.getByLabelText('Publisher'), 'Pub');
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByRole('button', { name: 'Edit existing item' })).toBeInTheDocument();
  });

  it('opens the editor when list-row Publish fails client validation', async () => {
    const urlOnlyDraft: AdminNewsItem = {
      ...adminItem,
      id: 'url-only',
      title: '',
      summary: '',
      publisher: '',
    };
    mockAdminFetch({ listItems: [urlOnlyDraft] });
    renderAdmin();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByRole('heading', { name: 'Edit news item' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(PUBLISH_REQUIREMENTS_MESSAGE);
    expect(screen.getByText(/Title must be/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
  });

  it('opens the editor with server validation fields when PATCH publish fails', async () => {
    mockAdminFetch({
      listItems: [adminItem],
      patchError: {
        body: { error: 'validation', fields: { summary: 'Too short' } },
        status: 400,
      },
    });
    renderAdmin();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByRole('heading', { name: 'Edit news item' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(PUBLISH_REQUIREMENTS_MESSAGE);
    expect(screen.getByText('Too short')).toBeInTheDocument();
  });

  it('shows a row alert for non-validation row action failures', async () => {
    mockAdminFetch({
      listItems: [{ ...adminItem, status: 'published' }],
      patchError: { body: { error: 'news_storage_unavailable' }, status: 503 },
    });
    renderAdmin();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Unpublish' })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not available/);
    const row = screen.getByRole('heading', { name: 'Existing title' }).closest('article');
    expect(within(row!).getByText('published')).toBeInTheDocument();
  });

  it('disables row actions while a patch is in flight', async () => {
    let resolvePatch: (() => void) | undefined;
    fetchMock.mockImplementation((url, init) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        return Promise.resolve(adminListResponse([adminItem]));
      }
      if (method === 'PATCH') {
        return new Promise<Response>((resolve) => {
          resolvePatch = () => resolve(json({ ...adminItem, status: 'published' }));
        });
      }
      return Promise.resolve(json({ error: 'not_found' }, 404));
    });
    renderAdmin();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument(),
    );
    const publish = screen.getByRole('button', { name: 'Publish' });
    await userEvent.click(publish);
    expect(publish).toBeDisabled();
    await userEvent.click(publish);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1);
    resolvePatch?.();
    await waitFor(() => expect(publish).not.toBeDisabled());
  });

  it('uploads a thumbnail and sets imageUrl', async () => {
    mockAdminFetch({ listItems: [] });
    renderAdmin();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    const file = new File([new Uint8Array([1, 2, 3])], 'thumb.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Upload thumbnail'), file);
    expect(await screen.findByDisplayValue(uploadedThumbPath)).toBeInTheDocument();
    const uploadCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).includes('/api/admin/news/images') && init?.method === 'POST',
    );
    expect(uploadCall).toBeDefined();
  });

  it('shows upload error from server', async () => {
    mockAdminFetch({
      listItems: [],
      imageUploadError: { body: { error: 'invalid_image' }, status: 400 },
    });
    renderAdmin();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    const file = new File([new Uint8Array([1, 2, 3])], 'bad.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Upload thumbnail'), file);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Invalid image/);
  });

  it('disables save, fetch, and cancel while upload is in flight', async () => {
    let resolveUpload: (() => void) | undefined;
    fetchMock.mockImplementation((url, init) => {
      const method = init?.method ?? 'GET';
      const path = String(url);
      if (path.includes('/api/admin/news/images') && method === 'POST') {
        return new Promise<Response>((resolve) => {
          resolveUpload = () => resolve(json({ imageUrl: uploadedThumbPath }, 201));
        });
      }
      if (method === 'GET' && path.includes('/api/admin/news')) {
        return Promise.resolve(adminListResponse([]));
      }
      return Promise.resolve(json({ error: 'not_found' }, 404));
    });
    renderAdmin();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    await userEvent.type(screen.getByLabelText('Source URL'), 'https://example.com/x');
    const file = new File([new Uint8Array([1, 2, 3])], 'thumb.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Upload thumbnail'), file);
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fetch details' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeDisabled();
    resolveUpload?.();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).not.toBeDisabled());
  });

  it('ignores upload completion after cancel', async () => {
    let resolveUpload: (() => void) | undefined;
    fetchMock.mockImplementation((url, init) => {
      const method = init?.method ?? 'GET';
      const path = String(url);
      if (path.includes('/api/admin/news/images') && method === 'POST') {
        return new Promise<Response>((resolve) => {
          resolveUpload = () => resolve(json({ imageUrl: uploadedThumbPath }, 201));
        });
      }
      if (method === 'GET' && path.includes('/api/admin/news')) {
        return Promise.resolve(adminListResponse([]));
      }
      return Promise.resolve(json({ error: 'not_found' }, 404));
    });
    renderAdmin();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    const file = new File([new Uint8Array([1, 2, 3])], 'thumb.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Upload thumbnail'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument(),
    );
    resolveUpload?.();
    await Promise.resolve();
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    expect(screen.getByLabelText('Image URL (https)')).toHaveValue('');
  });

  it('removes thumbnail from the form', async () => {
    mockAdminFetch({ listItems: [] });
    renderAdmin();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    const file = new File([new Uint8Array([1, 2, 3])], 'thumb.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Upload thumbnail'), file);
    expect(await screen.findByDisplayValue(uploadedThumbPath)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByDisplayValue(uploadedThumbPath)).not.toBeInTheDocument();
  });

  it('confirms before delete on archived row', async () => {
    const archived = { ...adminItem, status: 'archived' as const };
    mockAdminFetch({ listItems: [archived] });
    renderAdmin();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(window.confirm).toHaveBeenCalled();
  });
});
