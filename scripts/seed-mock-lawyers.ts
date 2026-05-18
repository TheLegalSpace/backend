import "dotenv/config";
import { randomUUID, randomBytes } from "crypto";
import {
  prisma,
  connectDatabase,
  disconnectDatabase,
} from "../src/config/database";

const MOCK_EMAIL_DOMAIN = "mock.legalspace.test";

const FIRST_NAMES = [
  "Adaeze", "Chinedu", "Yetunde", "Tunde", "Folake", "Emeka", "Ifeanyi",
  "Ngozi", "Bisi", "Kunle", "Femi", "Funke", "Aisha", "Ibrahim", "Hassan",
  "Fatima", "Olumide", "Chiamaka", "Amaka", "Obi", "Sade", "Chuka",
  "Tope", "Ade", "Uche", "Bola", "Wale", "Seyi", "Zainab", "Musa",
];

const LAST_NAMES = [
  "Okafor", "Adeyemi", "Okonkwo", "Eze", "Adebayo", "Nwosu", "Bello",
  "Yusuf", "Mohammed", "Adekunle", "Oyelaran", "Adesanya", "Olawale",
  "Okoye", "Nnamdi", "Lawal", "Garba", "Ojo", "Akinwale", "Obi",
];

const FIRM_SURNAMES = [
  "Olaniwun Ajayi", "Templars", "Aluko & Oyebode", "Banwo", "Udo Udoma",
  "Wigwe", "Chief Akinjide", "Sterling Partners", "Adepetun Caxton",
  "Dele Adesina", "Punuka Attorneys", "Bloomfield", "Detail Solicitors",
  "G. Elias", "Streamsowers",
];
const FIRM_SUFFIXES = ["& Co", "Chambers", "LP", "Partners", "Solicitors"];

const CITIES = [
  "Lagos", "Abuja", "Port Harcourt", "Ibadan", "Kano",
  "Benin", "Enugu", "Kaduna", "Calabar", "Abeokuta",
];

const NBA_BRANCHES = [
  "Lagos Branch", "Ikeja Branch", "Abuja Branch", "Port Harcourt Branch",
  "Ibadan Branch", "Kano Branch", "Benin Branch", "Enugu Branch",
];

type FeeTier = "junior" | "mid" | "senior";
const FEE_RANGES: Record<FeeTier, [number, number]> = {
  junior: [5_000_000, 30_000_000],
  mid: [50_000_000, 200_000_000],
  senior: [200_000_000, 1_000_000_000],
};
const FIRM_FEE_TIERS: Record<"small" | "large", [number, number]> = {
  small: [20_000_000, 100_000_000],
  large: [200_000_000, 2_000_000_000],
};

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const pickN = <T>(arr: T[], n: number): T[] =>
  [...arr].sort(() => Math.random() - 0.5).slice(0, n);
const randint = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const rand = (min: number, max: number) => Math.random() * (max - min) + min;

const seedLawyer = async (practiceAreaIds: string[], i: number) => {
  const email = `lawyer${i}@${MOCK_EMAIL_DOMAIN}`;
  if (await prisma.account.findUnique({ where: { email } })) {
    return { id: null, skipped: true };
  }
  const fullName = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  const city = pick(CITIES);
  const tier: FeeTier = pick(["junior", "mid", "senior"]);
  const [feeMin, feeMax] = FEE_RANGES[tier];
  const callToBarYear =
    tier === "junior"
      ? randint(2018, 2023)
      : tier === "mid"
      ? randint(2008, 2017)
      : randint(1990, 2007);
  const isNew = Math.random() < 0.15;
  const avgRating = isNew ? 0 : Number(rand(3.5, 4.95).toFixed(2));
  const reviewCount = isNew ? 0 : randint(3, 220);
  const lastActiveAt = new Date(
    Date.now() - randint(0, 6) * 24 * 60 * 60 * 1000
  );
  const areaIds = pickN(practiceAreaIds, randint(1, 2));

  const account = await prisma.account.create({
    data: {
      authUserId: `mock-${randomUUID()}`,
      email,
      role: "LAWYER",
      status: "active",
      fullName,
      bio: `Lawyer based in ${city}. Call to bar ${callToBarYear}.`,
      locationCity: city,
      locationCountry: "Nigeria",
      avgRating,
      reviewCount,
      lastActiveAt,
      lawyerProfile: {
        create: {
          scn: `SCN-MOCK-${randomBytes(4).toString("hex")}`,
          callToBarYear,
          nbaBranch: pick(NBA_BRANCHES),
          feeRangeMin: feeMin,
          feeRangeMax: feeMax,
          verificationStatus: "verified",
        },
      },
      practiceAreaLinks: {
        create: areaIds.map((id) => ({ practiceAreaId: id })),
      },
    },
  });
  return { id: account.id, skipped: false };
};

const seedFirm = async (practiceAreaIds: string[], i: number) => {
  const email = `firm${i}@${MOCK_EMAIL_DOMAIN}`;
  if (await prisma.account.findUnique({ where: { email } })) {
    return { id: null, skipped: true };
  }
  const firmName = `${pick(FIRM_SURNAMES)} ${pick(FIRM_SUFFIXES)}`;
  const city = pick(CITIES);
  const size: "small" | "large" = pick(["small", "large"]);
  const [feeMin, feeMax] = FIRM_FEE_TIERS[size];
  const isNew = Math.random() < 0.1;
  const avgRating = isNew ? 0 : Number(rand(3.8, 4.95).toFixed(2));
  const reviewCount = isNew ? 0 : randint(10, 400);
  const lastActiveAt = new Date(
    Date.now() - randint(0, 6) * 24 * 60 * 60 * 1000
  );
  const areaIds = pickN(practiceAreaIds, randint(2, 4));
  const firmEstablishmentYear = randint(1970, 2020);

  const account = await prisma.account.create({
    data: {
      authUserId: `mock-${randomUUID()}`,
      email,
      role: "FIRM",
      status: "active",
      fullName: firmName,
      bio: `${firmName} — multi-practice law firm based in ${city}.`,
      locationCity: city,
      locationCountry: "Nigeria",
      avgRating,
      reviewCount,
      lastActiveAt,
      firmProfile: {
        create: {
          firmName,
          rcNumber: `RC-MOCK-${randomBytes(3).toString("hex")}`,
          firmEstablishmentYear,
          feeRangeMin: feeMin,
          feeRangeMax: feeMax,
          verificationStatus: "verified",
        },
      },
      practiceAreaLinks: {
        create: areaIds.map((id) => ({ practiceAreaId: id })),
      },
    },
  });
  return { id: account.id, skipped: false };
};

const main = async () => {
  await connectDatabase();
  const areas = await prisma.practiceArea.findMany({
    where: { isActive: true },
  });
  if (areas.length === 0) {
    console.error("No practice areas found. Run `npm run seed` first.");
    process.exit(1);
  }
  console.log(`Found ${areas.length} active practice areas.`);
  const areaIds = areas.map((a) => a.id);

  const LAWYER_COUNT = 30;
  const FIRM_COUNT = 10;
  let lCreated = 0;
  let lSkipped = 0;
  let fCreated = 0;
  let fSkipped = 0;

  const lawyerJobs = Array.from({ length: LAWYER_COUNT }, (_, k) => k + 1).map(
    async (i) => {
      const r = await seedLawyer(areaIds, i);
      process.stdout.write(r.skipped ? "." : "L");
      return r;
    }
  );
  const lawyerResults = await Promise.all(lawyerJobs);
  process.stdout.write("\n");
  for (const r of lawyerResults) (r.skipped ? lSkipped++ : lCreated++);

  const firmJobs = Array.from({ length: FIRM_COUNT }, (_, k) => k + 1).map(
    async (i) => {
      const r = await seedFirm(areaIds, i);
      process.stdout.write(r.skipped ? "." : "F");
      return r;
    }
  );
  const firmResults = await Promise.all(firmJobs);
  process.stdout.write("\n");
  for (const r of firmResults) (r.skipped ? fSkipped++ : fCreated++);

  console.log(`\nLawyers: ${lCreated} created, ${lSkipped} already existed`);
  console.log(`Firms:   ${fCreated} created, ${fSkipped} already existed`);
  console.log(`\nAll mock accounts use the email domain @${MOCK_EMAIL_DOMAIN}.`);
  console.log("They cannot log in (no Supabase identity). Use for matchmaking testing only.");

  await disconnectDatabase();
};

main().catch(async (e) => {
  console.error(e);
  await disconnectDatabase();
  process.exit(1);
});
