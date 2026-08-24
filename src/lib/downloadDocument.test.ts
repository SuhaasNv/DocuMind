import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { downloadDocument } from './downloadDocument';
import { useAppStore } from '@/stores/useAppStore';

function mockFetchOnce(response: Response) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

describe('downloadDocument', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    useAppStore.getState().setAuthenticated(
      true,
      { id: 'u1', email: 'a@b.c', name: 'A' },
      'jwt-token',
    );
    createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { writable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: revokeObjectURL });
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches with the download flag, saves via a transient <a download>, and revokes the object URL', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    mockFetchOnce(new Response(blob, { status: 200 }));

    await downloadDocument('jwt-token', 'doc-1', 'Report.pdf');

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('http://localhost:3000/documents/doc-1/file?download=1');
    expect(init.headers.Authorization).toBe('Bearer jwt-token');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('maps 404 to a friendly "no longer available" message without downloading', async () => {
    mockFetchOnce(new Response(null, { status: 404 }));

    await expect(downloadDocument('jwt-token', 'doc-1', 'Report.pdf')).rejects.toThrow(
      /no longer available/i,
    );
    expect(clickSpy).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('clears the session and throws the session-expired message on 401', async () => {
    mockFetchOnce(new Response(null, { status: 401 }));

    await expect(downloadDocument('jwt-token', 'doc-1', 'Report.pdf')).rejects.toThrow(
      /session expired/i,
    );
    expect(useAppStore.getState().isAuthenticated).toBe(false);
  });

  it('revokes the object URL even if the click throws (no leak)', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    mockFetchOnce(new Response(blob, { status: 200 }));
    clickSpy.mockImplementation(() => {
      throw new Error('boom');
    });

    await expect(downloadDocument('jwt-token', 'doc-1', 'Report.pdf')).rejects.toThrow('boom');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
