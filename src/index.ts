import Fastify from "fastify";
import fetch from "node-fetch";
import config from "./config";
import { supabase } from "../supabase/supabase.init";

const fastify = Fastify();

const POSTBRIDGE_TOKEN = config.postbridgeToken;

// Função que gera a imagem da legenda
async function generateCaptionImage(text: string): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const width = 1080;
  const height = 1080;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#000000";
  ctx.font = "40px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lines = wrapText(ctx, text, width - 100);
  const lineHeight = 55;
  const startY = height / 2 - (lines.length * lineHeight) / 2;

  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, startY + i * lineHeight);
  });

  return canvas.toBuffer("image/png");
}

function wrapText(ctx: any, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const testLine = line + word + " ";
    if (ctx.measureText(testLine).width > maxWidth) {
      lines.push(line);
      line = word + " ";
    } else {
      line = testLine;
    }
  }

  lines.push(line);
  return lines;
}

// ------------------------
// POST /post
// ------------------------
fastify.post("/post", async (request, reply) => {
  const body = request.body as { caption?: string };
  const caption = body?.caption || "Legenda padrão de teste";

  console.log("Caption recebida:", caption);

  const result = await postToBridge(caption);
  return reply.send({ ok: true, caption, publicUrl: result.mediaUrl, postbridgeResponse: result.response });
});

const port = config.port;
fastify
  .listen({ port, host: "0.0.0.0" })
  .then((address) => {
    console.log(config.groups);
    console.log("Server listening at", address);
    const caption = process.env.STARTUP_CAPTION;
    if (caption) {
      postToBridge(caption)
        .then((r) => {
          console.log("Startup post OK", { mediaUrl: r.mediaUrl, postbridge: r.response });
        })
        .catch((e) => {
          console.error("Startup post FAIL", e);
        });
    } else {
      console.log("No STARTUP_CAPTION defined, skipping startup post.");
    }
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

async function postToBridge(caption: string): Promise<{ mediaUrl: string; response: any }> {
  const imageBuffer = await generateCaptionImage(caption);

  let mediaUrl = "";
  if (supabase) {
    const filename = `${config.supabaseFolder}${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
    const upload = await supabase.storage.from(config.supabaseBucket).upload(filename, imageBuffer, {
      contentType: "image/png",
      upsert: true,
    });
    if (upload.error) {
      throw new Error(`Supabase upload failed: ${upload.error.message}`);
    }
    const pub = supabase.storage.from(config.supabaseBucket).getPublicUrl(filename);
    mediaUrl = pub.data.publicUrl;
  } else {
    throw new Error("Supabase client not initialized");
  }

  const resp = await fetch("https://api.post-bridge.com/v1/posts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${POSTBRIDGE_TOKEN}`,
    },
    body: JSON.stringify({
      caption,
      media_urls: [mediaUrl],
      social_accounts: config.accountIds,
      is_draft: config.isDev,
    }),
  });
  const data = await resp.json();
  return { mediaUrl, response: data };
}
