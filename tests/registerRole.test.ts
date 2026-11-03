import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The role picked at signup has to survive until the email code is verified.
 * When it lived only in Redis, a Redis outage between the two steps quietly
 * turned a lawyer into a USER — no error, just the wrong account.
 */

const createUser = vi.fn();
const updateUserById = vi.fn();
const generateLink = vi.fn();
const verifyOtp = vi.fn();
const accountCreate = vi.fn();
const redisGet = vi.fn();

vi.mock("../src/config/database", () => ({
  prisma: { account: { create: (...a: any[]) => accountCreate(...a) } },
}));
vi.mock("../src/config/redis", () => ({
  redis: {
    get: (...a: any[]) => redisGet(...a),
    set: vi.fn(async () => "OK"),
    del: vi.fn(async () => 1),
    ttl: vi.fn(),
    incr: vi.fn(async () => 1),
    expire: vi.fn(),
  },
}));
vi.mock("../src/config/supabase", () => ({
  supabase: { auth: { verifyOtp: (...a: any[]) => verifyOtp(...a) } },
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: (...a: any[]) => createUser(...a),
        updateUserById: (...a: any[]) => updateUserById(...a),
        generateLink: (...a: any[]) => generateLink(...a),
      },
    },
  },
}));
vi.mock("../src/dao/account", () => ({
  findAccountByEmail: vi.fn(async () => null),
  findAccountByAuthUserId: vi.fn(async () => null),
  softDeleteAccount: vi.fn(),
}));
vi.mock("../src/middleware/auth", () => ({ invalidateAccountCache: vi.fn() }));
vi.mock("../src/services/captcha", () => ({ verifyCaptcha: vi.fn() }));
vi.mock("../src/services/email", () => ({ sendEmail: vi.fn() }));
vi.mock("../src/dao/matchOffer", () => ({ releaseBatchIfSettled: vi.fn() }));
vi.mock("../src/services/notification", () => ({ dispatchNotification: vi.fn() }));

const { _registerStart, _registerVerify } = await import("../src/logic/auth");

const START = { email: "ada@example.com", password: "secret123", role: "PENDING_PROFESSIONAL" as const };

const verifiedAs = (appMetadata: any) =>
  verifyOtp.mockResolvedValue({
    data: {
      user: { id: "auth-1", app_metadata: appMetadata },
      session: { access_token: "a", refresh_token: "r", expires_at: 1 },
    },
    error: null,
  });

beforeEach(() => {
  createUser.mockReset().mockResolvedValue({ data: { user: { id: "auth-1" } }, error: null });
  updateUserById.mockReset().mockResolvedValue({ error: null });
  generateLink
    .mockReset()
    .mockResolvedValue({ data: { user: { id: "auth-1" }, properties: { email_otp: "123456" } }, error: null });
  verifyOtp.mockReset();
  accountCreate.mockReset().mockImplementation(async ({ data }: any) => data);
  redisGet.mockReset().mockResolvedValue(null);
});

describe("signup role", () => {
  it("is stored on the auth user, not only in Redis", async () => {
    await _registerStart(START);
    expect(createUser.mock.calls[0][0].app_metadata).toEqual({ registerRole: "PENDING_PROFESSIONAL" });
  });

  it("is re-stored when an abandoned earlier signup left the auth user behind", async () => {
    createUser.mockResolvedValue({ data: null, error: { message: "User already registered", status: 422 } });
    await _registerStart(START);
    expect(updateUserById).toHaveBeenCalledWith("auth-1", {
      app_metadata: { registerRole: "PENDING_PROFESSIONAL" },
    });
  });

  it("survives a Redis outage between signup and verification", async () => {
    redisGet.mockRejectedValue(new Error("Redis down"));
    verifiedAs({ registerRole: "PENDING_PROFESSIONAL" });
    await _registerVerify({ email: START.email, otp: "123456" });
    expect(accountCreate.mock.calls[0][0].data.role).toBe("PENDING_PROFESSIONAL");
  });

  it("still reads Redis for signups started before the role moved", async () => {
    redisGet.mockResolvedValue("PENDING_PROFESSIONAL");
    verifiedAs({});
    await _registerVerify({ email: START.email, otp: "123456" });
    expect(accountCreate.mock.calls[0][0].data.role).toBe("PENDING_PROFESSIONAL");
  });

  it("never grants a role that can't be self-registered", async () => {
    verifiedAs({ registerRole: "ADMIN" });
    await _registerVerify({ email: START.email, otp: "123456" });
    expect(accountCreate.mock.calls[0][0].data.role).toBe("USER");
  });
});
