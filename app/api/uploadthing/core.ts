import {
  createUploadthing,
  type FileRouter,
} from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";

import { auth } from "@/lib/auth";

const f = createUploadthing();

async function requireAuthenticatedUser(req: Request) {
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (!session?.user) {
    throw new UploadThingError("Unauthorized");
  }

  return {
    userId: session.user.id,
  };
}

export const ourFileRouter = {
  /**
   * Used by the TinyMCE editor and by FileUploadField when
   * mode="image".
   *
   * Allows up to five images per upload request. TinyMCE still
   * uploads one image at a time, while FileUploadField may upload
   * several images together.
   */
  imageUploader: f({
    image: {
      maxFileSize: "4MB",
      maxFileCount: 5,
    },
  })
    .middleware(async ({ req }) => {
      return requireAuthenticatedUser(req);
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return {
        uploadedBy: metadata.userId,
        key: file.key,
        name: file.name,
        size: file.size,
        url: file.ufsUrl,
      };
    }),


  /**
   * Used by social feed posts for mixed image, audio, and video attachments.
   * The composer still caps a post at four total attachments; these per-type
   * limits only constrain individual UploadThing requests.
   */
  feedMediaUploader: f({
    image: {
      maxFileSize: "4MB",
      maxFileCount: 4,
      contentDisposition: "inline",
    },
    audio: {
      maxFileSize: "32MB",
      maxFileCount: 4,
      contentDisposition: "inline",
    },
    video: {
      maxFileSize: "128MB",
      maxFileCount: 4,
      contentDisposition: "inline",
    },
  })
    .middleware(async ({ req }) => {
      return requireAuthenticatedUser(req);
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return {
        uploadedBy: metadata.userId,
        key: file.key,
        name: file.name,
        size: file.size,
        url: file.ufsUrl,
      };
    }),

  /**
   * Used by FileUploadField when mode="file".
   *
   * The "blob" type accepts any file type. Restrict this route to
   * specific MIME types or UploadThing shorthands such as "pdf" or
   * "text" when a project requires tighter upload rules.
   */


  /**
   * Used by the Music system for track uploads.
   *
   * Audio files are kept separate from general attachments so music uploads
   * can have a larger limit without widening the limits for messaging/files.
   */
  audioUploader: f({
    audio: {
      maxFileSize: "64MB",
      maxFileCount: 12,
      contentDisposition: "inline",
    },
  })
    .middleware(async ({ req }) => {
      return requireAuthenticatedUser(req);
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return {
        uploadedBy: metadata.userId,
        key: file.key,
        name: file.name,
        size: file.size,
        url: file.ufsUrl,
      };
    }),

  fileUploader: f({
    blob: {
      maxFileSize: "16MB",
      maxFileCount: 5,
      contentDisposition: "attachment",
    },
  })
    .middleware(async ({ req }) => {
      return requireAuthenticatedUser(req);
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return {
        uploadedBy: metadata.userId,
        key: file.key,
        name: file.name,
        size: file.size,
        url: file.ufsUrl,
      };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
