import "dotenv/config";
import slugify from "slugify";
import { prisma } from "../../config/database";

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
