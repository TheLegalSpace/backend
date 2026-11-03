import { describe, it, expect, vi, beforeEach } from "vitest";
import { v2 as cloudinary } from "cloudinary";

/**
 * Research PDFs are confidential legal material. Two promises are pinned here:
 * a response never carries a permanent link to one, and "delete" means gone.
 */

const findThreadById = vi.fn();
const deleteThread = vi.fn();
const destroy = vi.fn();

vi.mock("../src/config/cloudinary", () => ({}));
vi.mock("../src/dao/research", () => ({
  createThread: vi.fn(),
  listThreads: vi.fn(),
  findThreadById: (...a: any[]) => findThreadById(...a),
  updateThread: vi.fn(),
  touchThread: vi.fn(),
  deleteThread: (...a: any[]) => deleteThread(...a),
  createMessage: vi.fn(),
  listMessagesForThread: vi.fn(),
  countMessagesForThread: vi.fn(),
}));
vi.mock("../src/services/research", () => ({ runResearch: vi.fn(), generateThreadTitle: vi.fn() }));
vi.mock("../src/logic/credits", () => ({ assertResearchCredit: vi.fn(), spendResearchCredit: vi.fn() }));

cloudinary.config({ cloud_name: "demo", api_key: "key", api_secret: "secret" });
vi.spyOn(cloudinary.uploader, "destroy").mockImplementation((...a: any[]) => destroy(...a));

const { _getThread, _deleteThread } = await import("../src/logic/research");
const { documentUrl, parseCloudinaryUrl } = await import("../src/services/storage");

const OWNER = "lawyer-1";
const LEGACY_URL =
  "https://res.cloudinary.com/demo/image/upload/v1712345678/research/lawyer-1/1712-abc.pdf";

const thread = () => ({
  id: "t-1",
  accountId: OWNER,
  messages: [
    {
      id: "m-1",
      role: "user",
      attachments: [
        { kind: "pdf", key: "research/lawyer-1/1800-def.pdf", filename: "brief.pdf", sizeBytes: 10 },
      ],
    },
    { id: "m-2", role: "user", attachments: [{ kind: "pdf", url: LEGACY_URL, filename: "old.pdf", sizeBytes: 5 }] },
    { id: "m-3", role: "assistant", attachments: null },
  ],
});

beforeEach(() => {
  findThreadById.mockReset().mockResolvedValue(thread());
  deleteThread.mockReset().mockResolvedValue({});
  destroy.mockReset().mockResolvedValue({ result: "ok" });
});

describe("reading a thread", () => {
  it("returns an expiring signed link, never the storage key", async () => {
    const res = await _getThread("t-1", OWNER);
    const [a] = res.data.messages[0].attachments;
    expect(a.key).toBeUndefined();
    expect(a.url).toContain("/image/download");
    expect(a.url).toContain("type=authenticated");
    expect(a.url).toMatch(/expires_at=\d+/);
    expect(a.filename).toBe("brief.pdf");
  });

  it("keeps serving a pre-migration attachment rather than breaking it", async () => {
    const res = await _getThread("t-1", OWNER);
    expect(res.data.messages[1].attachments[0].url).toBe(LEGACY_URL);
  });

  it("refuses anyone but the owner", async () => {
    await expect(_getThread("t-1", "someone-else")).rejects.toThrow(/do not own/);
  });
});

describe("deleting a thread", () => {
  it("erases the rows and every uploaded PDF, including pre-migration ones", async () => {
    await _deleteThread("t-1", OWNER);
    expect(deleteThread).toHaveBeenCalledWith("t-1");
    const destroyed = destroy.mock.calls.map((c) => [c[0], c[1].type]);
    expect(destroyed).toEqual([
      ["research/lawyer-1/1800-def", "authenticated"],
      ["research/lawyer-1/1712-abc", "upload"],
    ]);
  });

  it("removes the rows first, so a storage failure can't leave a thread pointing at nothing", async () => {
    const order: string[] = [];
    deleteThread.mockImplementation(async () => order.push("rows"));
    destroy.mockImplementation(async () => order.push("file"));
    await _deleteThread("t-1", OWNER);
    expect(order[0]).toBe("rows");
  });

  it("still succeeds when a file can't be removed", async () => {
    destroy.mockRejectedValue(new Error("cloudinary down"));
    await expect(_deleteThread("t-1", OWNER)).resolves.toMatchObject({ error: false });
  });

  it("deletes nothing for someone who isn't the owner", async () => {
    await expect(_deleteThread("t-1", "someone-else")).rejects.toThrow(/do not own/);
    expect(deleteThread).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });
});

describe("storage keys", () => {
  it("recovers the public_id and format from a delivery URL", () => {
    expect(parseCloudinaryUrl(LEGACY_URL)).toEqual({
      resourceType: "image",
      publicId: "research/lawyer-1/1712-abc",
      format: "pdf",
    });
    expect(parseCloudinaryUrl("https://example.com/not-cloudinary.pdf")).toBeNull();
  });

  it("only hands out expiring links for private keys", () => {
    const url = new URL(documentUrl("verification/acc/call_to_bar_cert/1-a.pdf"));
    const expiresAt = Number(url.searchParams.get("expires_at"));
    const ttl = expiresAt - Math.floor(Date.now() / 1000);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(15 * 60);
  });
});
