import "dotenv/config";
import slugify from "slugify";
import { prisma } from "../../config/database";
import { PLAN_SEEDS } from "../../config/membership";
import { createPlan } from "../../services/paystack";
import { env } from "../../config/env";

const PRACTICE_AREAS = [
  "Corporate Law",
  "Intellectual Property",
  "Energy Law",
  "Marriage Law",
  "Tax Law",
  "Criminal Law",
  "Property Law",
  "Employment Law",
  "Banking & Finance",
  "Litigation",
  "Immigration Law",
  "Family Law",
  "Constitutional Law",
  "Environmental Law",
  "Maritime Law",
  "Aviation Law",
  "Commercial Law",
  "Human Rights Law",
  "Telecommunications Law",
  "Insurance Law",
];

async function main() {
  for (const name of PRACTICE_AREAS) {
    const slug = slugify(name, { lower: true, strict: true });
    await prisma.practiceArea.upsert({
      where: { slug },
      update: { name, isActive: true },
      create: { name, slug, isActive: true },
    });
  }
  console.log(`[seed] inserted/updated ${PRACTICE_AREAS.length} practice areas`);

  // Membership plans. Paid plans are also registered on Paystack (when a secret key is
  // present) so the Plan row carries a paystackPlanCode that subscribe/checkout needs.
  for (const seed of PLAN_SEEDS) {
    const plan = await prisma.plan.upsert({
      where: { code: seed.code },
      update: {
        name: seed.name,
        tier: seed.tier,
        forRole: seed.forRole,
        priceKobo: seed.priceKobo,
        intervalMonths: seed.intervalMonths,
        features: seed.features,
        isActive: true,
      },
      create: {
        code: seed.code,
        name: seed.name,
        tier: seed.tier,
        forRole: seed.forRole,
        priceKobo: seed.priceKobo,
        intervalMonths: seed.intervalMonths,
        features: seed.features,
      },
    });

    if (seed.priceKobo > 0 && !plan.paystackPlanCode && env.paystackSecretKey) {
      try {
        const { plan_code } = await createPlan({
          name: `${seed.name} (${seed.forRole ?? "ALL"})`,
          amountKobo: seed.priceKobo,
          intervalMonths: seed.intervalMonths,
        });
        await prisma.plan.update({ where: { id: plan.id }, data: { paystackPlanCode: plan_code } });
        console.log(`[seed] registered Paystack plan for ${seed.code}: ${plan_code}`);
      } catch (err: any) {
        console.warn(`[seed] could not register Paystack plan for ${seed.code}: ${err?.message}`);
      }
    }
  }
  console.log(`[seed] inserted/updated ${PLAN_SEEDS.length} membership plans`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
