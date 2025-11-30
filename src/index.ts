import Fastify from "fastify";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const fastify = Fastify();

const POSTBRIDGE_TOKEN = process.env.POSTBRIDGE_TOKEN!;
const SOCIAL_ACCOUNT_ID = Number(process.env.SOCIAL_ACCOUNT_ID || 12345);

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

  let filePath: string;
  try {
    const imageBuffer = await generateCaptionImage(caption);
    filePath = path.join(process.cwd(), "output.png");
    fs.writeFileSync(filePath, imageBuffer);
  } catch (err) {
    return reply.status(500).send({ ok: false, error: "canvas module not available" });
  }

  // 2) Mock URL (substituir futuramente pelo upload real)
  const fakeMediaUrl = "https://example.com/mock-media.png";

  // 3) Enviar para PostBridge
  const resp = await fetch("https://api.post-bridge.com/v1/posts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${POSTBRIDGE_TOKEN}`,
    },
    body: JSON.stringify({
      caption,
      media_urls: [fakeMediaUrl],
      social_accounts: [SOCIAL_ACCOUNT_ID],
    }),
  });

  const data = await resp.json();

  return reply.send({
    ok: true,
    caption,
    localImage: filePath,
    mediaMock: fakeMediaUrl,
    postbridgeResponse: data,
  });
});

const port = Number(process.env.PORT) || 3000;
fastify
  .listen({ port, host: "0.0.0.0" })
  .then((address) => {
    console.log("Server listening at", address);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
