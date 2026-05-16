const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

const uploadToCloudinary = (fileBuffer, folder, resourceType = "image", isReel = false) => {
  return new Promise((resolve, reject) => {
    // Only apply the vertical crop if it's explicitly a reel
    const videoTransformation = isReel 
      ? [
          { width: 1080, height: 1920, crop: "fill" }, 
          { fetch_format: "mp4" },
          { bit_rate: "800k" }
        ]
      : [
          { quality: "auto" },
          { fetch_format: "mp4" }
        ];

    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        transformation: resourceType === "video" 
          ? videoTransformation 
          : [{ quality: "auto", fetch_format: "webp" }],
      },
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(stream);
  });
};

module.exports = uploadToCloudinary;