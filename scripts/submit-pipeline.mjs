import process from "node:process";
import { runSubmitPipeline } from "../src/submit/runSubmitPipeline.js";

async function main() {
  if (!process.argv[2]) {
    throw new Error("Usage: npm run submit -- submit/les_demo");
  }

  const result = await runSubmitPipeline({
    lessonDir: process.argv[2],
    skipUpload: process.env.SKIP_UPLOAD === "1",
    upload: {
      dryRun: process.env.RCLONE_DRY_RUN === "1",
    },
  });

  console.log(`Report saved: ${result.reportPath}`);
  if (result.report.upload?.skipped) {
    console.log(`Upload skipped: ${result.report.upload.reason}`);
  } else if (result.report.upload?.dryRun) {
    console.log(`Upload dry run target: ${result.report.upload.remotePath}`);
  } else {
    console.log(`Uploaded to: ${result.report.upload.remotePath}`);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
