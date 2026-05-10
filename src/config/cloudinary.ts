import { v2 as cloudinary } from "cloudinary";
import { env } from "./env";

cloudinary.config({
  cloud_name: env.cloudinaryCloudName,
  api_key: env.cloudinaryApiKey,
  api_secret: env.cloudinaryApiSecret,
  secure: env.cloudinarySecure,
});

export { cloudinary };