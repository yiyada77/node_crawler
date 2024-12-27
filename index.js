const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");
const { parse } = require("json2csv");
const fs = require("fs");
const sharp = require("sharp");

// Base URL and paths for scraping
const BASE_URL = "https://gd.eppo.int";
const ORGANISM_PATHS = [
  "/photos/acari",
  "/photos/bacteria",
  "/photos/chromista",
  "/photos/fungi",
  "/photos/gastropoda",
  "/photos/insecta",
  "/photos/nematoda",
  "/photos/plantae",
  "/photos/rodentia",
  "/photos/virus",
];

// Main function to scrape and process data
async function scrapeData() {
  try {
    const records = [];
    const imagesDir = path.join(__dirname, "images");
    const csvPath = path.join(__dirname, "output.csv");

    // Clean up previous outputs
    deleteIfExists(imagesDir);
    deleteIfExists(csvPath);

    // Recreate the `images` directory
    fs.mkdirSync(imagesDir);

    // Iterate over each organism category
    for (const organismPath of ORGANISM_PATHS) {
      const categoryUrl = `${BASE_URL}${organismPath}`;
      const organismType = organismPath.split("/").pop();
      console.log(`Scraping category: ${categoryUrl}`);

      // Fetch category page content
      const categoryResponse = await axios.get(categoryUrl);
      const $category = cheerio.load(categoryResponse.data);

      // Extract links to taxon pages
      const taxonPaths = [];
      $category("a").each((_, element) => {
        const href = $category(element).attr("href");
        if (href && href.startsWith("/taxon") && href.endsWith("photos")) {
          taxonPaths.push(href);
        }
      });

      console.log(`Found taxon paths:`, taxonPaths);

      // Process each taxon page
      for (const taxonPath of taxonPaths) {
        const taxonUrl = `${BASE_URL}${taxonPath}`;
        console.log(`Scraping taxon: ${taxonUrl}`);

        try {
          const taxonResponse = await axios.get(taxonUrl);
          const $taxon = cheerio.load(taxonResponse.data);

          // Extract taxon details
          const preferredName = $taxon(".hero h2 span i").text().trim();
          const eppoCode = $taxon(".hero h2 small")
            .text()
            .replace(/[()]/g, "")
            .trim();

          // Extract photo details
          $taxon("#portfolio .element").each((_, element) => {
            const imageUrl =
              `https://gd.eppo.int${$taxon(element).find("a").attr("href")}` ||
              "";
            const classList = $taxon(element).attr("class") || "";
            const tag =
              classList
                .split(" ")
                .find((cls) => cls.startsWith("tag-"))
                ?.replace("tag-", "") || "None";

            const description = $taxon(element)
              .find(".pcap p")
              .text()
              .replace(/\s+/g, " ") // Replace all newlines and spaces with a single space
              .trim();

            const courtesy = $taxon(element)
              .find(".pcap small strong")
              .parent()
              .text()
              .replace("Courtesy:", "")
              .replace(/\s+/g, " ")
              .trim();

            records.push({
              imageUrl,
              eppoCode,
              organismType,
              preferredName,
              tag,
              description,
              courtesy,
            });
          });
        } catch (error) {
          console.error(
            `Failed to scrape taxon page: ${taxonUrl} - ${error.message}`
          );
        }
      }
    }

    // Download and process images
    // for (const record of records) {
    //   if (record.imageUrl) {
    //     const outputPath = path.join(imagesDir, path.basename(record.imageUrl));
    //     console.log(`Downloading image: ${record.imageUrl}`);
    //     await downloadAndCropImage(record.imageUrl, outputPath);
    //   }
    // }

    // Save records to CSV
    const csvData = parse(records, {
      fields: [
        "imageUrl",
        "eppoCode",
        "organismType",
        "preferredName",
        "tag",
        "description",
        "courtesy",
      ],
    });
    fs.writeFileSync(csvPath, csvData, "utf-8");
    console.log(`Records saved to: ${csvPath}`);
  } catch (error) {
    console.error("Scraping failed:", error.message);
  }
}

// Function to delete a file or folder
function deleteIfExists(targetPath) {
  if (fs.existsSync(targetPath)) {
    if (fs.lstatSync(targetPath).isDirectory()) {
      fs.rmSync(targetPath, { recursive: true, force: true });
      console.log(`Deleted directory: ${targetPath}`);
    } else {
      fs.unlinkSync(targetPath);
      console.log(`Deleted file: ${targetPath}`);
    }
  }
}

// Function to download and crop image
async function downloadAndCropImage(url, outputPath) {
  try {
    const response = await axios({
      url,
      method: "GET",
      responseType: "arraybuffer",
    });

    const imageBuffer = Buffer.from(response.data);

    const croppedImageBuffer = await sharp(imageBuffer)
      .metadata()
      .then((metadata) => {
        return sharp(imageBuffer)
          .extract({
            left: 0,
            top: 0,
            width: metadata.width,
            height: Math.max(0, metadata.height - 30), // Crop 30px from the bottom
          })
          .toBuffer();
      });

    fs.writeFileSync(outputPath, croppedImageBuffer);
    console.log(`Image saved to: ${outputPath}`);
  } catch (error) {
    console.error(
      `Failed to download or crop image: ${url} - ${error.message}`
    );
  }
}

// Start scraping
(async () => {
  console.time("Execution Time"); // Start timing
  await scrapeData(); // Wait for the asynchronous function to complete
  console.timeEnd("Execution Time"); // End timing and print the elapsed time
})();
