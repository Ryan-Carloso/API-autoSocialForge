import { GoogleGenerativeAI } from "@google/generative-ai";
import config from "./IMAGE/config";

async function main() {
  let url = "https://generativelanguage.googleapis.com/v1beta/models?key=" + config.geminiKey;
  while (url) {
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.models) {
          for (const m of data.models) {
              console.log(m.name, m.description);
          }
      }
      if (data.nextPageToken) {
          url = "https://generativelanguage.googleapis.com/v1beta/models?key=" + config.geminiKey + "&pageToken=" + data.nextPageToken;
      } else {
          url = "";
      }
  }
}

main();
