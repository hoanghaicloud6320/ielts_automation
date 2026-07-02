import process from "node:process";
import { prepareDemoLessonFromSample } from "../src/cli/demoSamples.js";

async function main() {
  await prepareDemoLessonFromSample({
    sampleRoot: process.argv[2] || "build/tmp/sample_data",
    lessonDir: process.argv[3] || "submit/les_demo",
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
