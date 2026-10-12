import { load } from "cheerio";
import * as fs from "fs";

const BASE = "https://bulletin.wustl.edu";

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, {
                ...options,
                headers: { "User-Agent": "Mozilla/5.0", ...options.headers },
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

// Get list of subjects
async function fetchSubjects() {
    const text = await fetchWithRetry(
        `${BASE}/course-search/api/?page=fose&route=search`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ other: { srcdb: "" }, criteria: [] }),
        },
    );
    const { results } = JSON.parse(text);

    return [
        ...new Set(
            results.map(({ code }) => code.slice(0, code.lastIndexOf(" "))),
        ),
    ].sort();
}

// Fetch one subject and parse the attributes of all courses
async function scrapeSubject(subject) {
    const url = `${BASE}/ribbit/?page=getcourse.rjs&subject=${encodeURIComponent(subject)}`;
    const xml = await fetchWithRetry(url);
    const $xml = load(xml, { xml: true });
    const courses = {};

    $xml("course").each((i, courseEl) => {
        const code = ($xml(courseEl).attr("code") || "")
            .replace(/ /g, " ")
            .trim();
        if (!code) return;

        const $ = load($xml(courseEl).text());
        const attrs = {};

        $(".courseblockextra .crs_attrstr").each((i, attr) => {
            const text = $(attr).text().replace(/ /g, " ").trim();
            const idx = text.indexOf(":");
            if (idx === -1) return;

            const key = text.slice(0, idx).trim();
            const value = text.slice(idx + 1).trim();

            attrs[key] = value
                ? value.split(",").map((x) => x.trim()).filter(Boolean)
                : [];
        });

        courses[code] = attrs;
    });

    return courses;
}

async function main() {
    const subjects = process.env.SUBJECTS
        ? process.env.SUBJECTS.split(",")
        : await fetchSubjects();

    console.log(`Found ${subjects.length} subjects`);
    const allCourses = {};
    for (const subject of subjects) {
        try {
            const courses = await scrapeSubject(subject);
            Object.assign(allCourses, courses);
            console.log(`${subject}: ${Object.keys(courses).length} courses`);
        } catch (err) {
            console.error(`Failed to scrape ${subject}:`, err.message);
        }
        await sleep(250);
    }

    const sorted = Object.fromEntries(
        Object.keys(allCourses)
            .sort()
            .map((code) => [code, allCourses[code]]),
    );

    fs.writeFileSync("data/attributes.json", JSON.stringify(sorted, null, 2));
    console.log(`Saved ${Object.keys(sorted).length} courses`);
}

await main();