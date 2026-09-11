import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  TEST_NIN_MATCH,
  TEST_NIN_NO_MATCH,
  TEST_SCN_MATCH,
  TEST_SCN_NO_MATCH,
} from "../src/config/verification";

// The reserved test values exist so the matched / mismatch screens are
// reachable while the paid providers are off. The thing that actually matters
// about them is that they are inert in production and inert once a provider is
// wired up — otherwise they are a verification bypass.

const envState = { nbaVerificationEnabled: false, ninVerificationEnabled: false };

vi.mock("../src/config/env", () => ({
  env: {
    get nbaVerificationEnabled() {
      return envState.nbaVerificationEnabled;
    },
    get ninVerificationEnabled() {
      return envState.ninVerificationEnabled;
    },
    identityProviderBase: "",
    identityProviderKey: "",
  },
}));

import { checkNbaRecord, checkNin } from "../src/services/identityVerification";

const NAME = "Oluwaseun Ezekiel Marian";
const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  envState.nbaVerificationEnabled = false;
  envState.ninVerificationEnabled = false;
  process.env.NODE_ENV = "development";
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("reserved test values, provider off, non-production", () => {
  it("forces an NBA match", async () => {
    const res = await checkNbaRecord({ scn: TEST_SCN_MATCH, fullName: NAME, callToBarYear: 2019 });
    expect(res.status).toBe("matched");
  });

  it("forces an NBA no_match", async () => {
    const res = await checkNbaRecord({
      scn: TEST_SCN_NO_MATCH,
      fullName: NAME,
      callToBarYear: 2019,
    });
    expect(res.status).toBe("no_match");
  });

  it("forces a NIN match and a NIN mismatch", async () => {
    expect((await checkNin({ nin: TEST_NIN_MATCH, fullName: NAME })).status).toBe("matched");
    expect((await checkNin({ nin: TEST_NIN_NO_MATCH, fullName: NAME })).status).toBe("no_match");
  });

  it("leaves any other value unchecked", async () => {
    expect((await checkNin({ nin: "22102921031", fullName: NAME })).status).toBe("unchecked");
    expect(
      (await checkNbaRecord({ scn: "SCN/2016/04821", fullName: NAME, callToBarYear: 2019 })).status
    ).toBe("unchecked");
  });
});

describe("the test values are inert where it counts", () => {
  it("is ignored in production", async () => {
    process.env.NODE_ENV = "production";
    expect((await checkNin({ nin: TEST_NIN_MATCH, fullName: NAME })).status).toBe("unchecked");
    expect(
      (await checkNbaRecord({ scn: TEST_SCN_MATCH, fullName: NAME, callToBarYear: 2019 })).status
    ).toBe("unchecked");
  });

  it("is ignored once the provider is enabled", async () => {
    envState.ninVerificationEnabled = true;
    envState.nbaVerificationEnabled = true;
    // No credentials configured, so a real check degrades to `unchecked` — the
    // point is that it is not "matched" on the strength of a typed value.
    expect((await checkNin({ nin: TEST_NIN_MATCH, fullName: NAME })).status).toBe("unchecked");
    expect(
      (await checkNbaRecord({ scn: TEST_SCN_MATCH, fullName: NAME, callToBarYear: 2019 })).status
    ).toBe("unchecked");
  });
});
