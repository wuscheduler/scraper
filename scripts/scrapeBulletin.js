import { load } from "cheerio";
import * as fs from "fs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }

      return await res.text();
    } catch (err) {
      if (attempt === retries) throw err;

      console.log(`Retry ${attempt}/${retries - 1} failed for ${url}`);
      await sleep(1000 * attempt);
    }
  }
}

async function scrapeBulletinPage(url) {
  console.log(`Scraping ${url}`);

  const html = await fetchWithRetry(url);
  const $ = load(html);
  const courses = {};

  $(".courseblock").each((i, el) => {
    const title = $(el)
      .find(".courseblocktitle")
      .text()
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join(" ")
      .replace(/\u00a0/g, " ");

    const attrs = {};

    $(el)
      .find(".courseblockextra .crs_attrstr")
      .each((i, attr) => {
        const text = $(attr).text().trim();
        const idx = text.indexOf(":");
        if (idx === -1) return;

        const key = text.slice(0, idx).trim();
        const value = text.slice(idx + 1).trim();

        attrs[key] = value
          ? value.split(",").map((x) => x.trim()).filter(Boolean)
          : [];
      });

    if (title) courses[title] = attrs;
  });

  return courses;
}

async function main() {
  const indexUrl = "https://bulletin.wustl.edu/undergrad/artsci/fields/";
  const html = await fetchWithRetry(indexUrl);
  const $ = load(html);

  const hrefs = $('a[href^="/undergrad/artsci/"]')
    .map((i, el) => $(el).attr("href"))
    .get();

  const base = "https://bulletin.wustl.edu";

  const filteredHrefs = [...new Set(hrefs)].filter(
    (href) =>
      href &&
      !href.includes("/requirements/") &&
      !href.includes("/honors/") &&
      !href.includes("/policies/") &&
      !href.includes("/administration/") &&
      !href.includes("/majors/") &&
      !href.includes("/minors/") &&
      !href.includes("/additional/") &&
      !href.includes("/summer/")
  );

  const allCourses = {};

  for (const href of filteredHrefs) {
    try {
      const pageCourses = await scrapeBulletinPage(base + href);
      Object.assign(allCourses, pageCourses);

      await sleep(500);
    } catch (err) {
      console.error(`Failed to scrape ${base + href}:`, err.message);
    }
  }

  fs.writeFileSync("data/attributes.json", JSON.stringify(allCourses, null, 2));
  console.log(`Saved ${Object.keys(allCourses).length} courses`);
}

await main();