import slugify from "slugify";
import { redis } from "../config/redis";
import { response } from "../helpers/utility";
import { Response } from "../interface";
import {
  findActivePracticeAreas,
  createPracticeArea,
  updatePracticeArea,
} from "../dao/practiceArea";

const CACHE_KEY = "practiceAreas:active";
const CACHE_TTL = 60 * 60;

export const _listPracticeAreas = async (): Promise<Response> => {
  const cached = await redis.get(CACHE_KEY).catch(() => null);
  if (cached) {
    try {
      return response({
        error: false,
        message: "Practice areas retrieved",
        data: JSON.parse(cached),
      });
    } catch {}
  }
  const items = await findActivePracticeAreas();
  await redis.set(CACHE_KEY, JSON.stringify(items), "EX", CACHE_TTL).catch(() => null);
  return response({ error: false, message: "Practice areas retrieved", data: items });
};

export const _createPracticeArea = async (name: string): Promise<Response> => {
  const slug = slugify(name, { lower: true, strict: true });
  const item = await createPracticeArea(name, slug);
  await redis.del(CACHE_KEY).catch(() => null);
  return response({ error: false, message: "Practice area created", data: item });
};

export const _updatePracticeArea = async (
  id: string,
  data: { name?: string; isActive?: boolean }
): Promise<Response> => {
  const item = await updatePracticeArea(id, data);
  await redis.del(CACHE_KEY).catch(() => null);
  return response({ error: false, message: "Practice area updated", data: item });
};
