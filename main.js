import * as fs from "fs";
import * as cheerio from "cheerio";
import config from "./config.js";
import { randomUUID } from "crypto";
import path, { resolve } from "path";

const NO_DEPARTMENT_SCHOOLS = new Set(["Olin Business School"]);

/**
 * Parses an HTML course catalog page into list of JS objects.
 */
const parseCatalog = (html, school) => {
    const $ = cheerio.load(html);
    const courses = [];

    $(".scpi__classes--row").each((_, courseEl) => {
        const $course = $(courseEl);
        const course = {
            id: $course.attr("data-course-id") || undefined,
            // The registrar's site labels courses outside of any of the schools
            // such as ROTC and Beyond Boundaries "WUSTL." These are more accurately
            // called "Other."
            school:
                school == "Washington University in St. Louis"
                    ? "Other"
                    : school,
            department: $course.find(".scpi-class__department").text().trim(),
            title: $course.find(".scpi-class__heading.wide").text().trim(),
            catalogNumber: $course
                .find(".scpi-class__heading.middle")
                .text()
                .trim(),
            units: $course.find(".scpi-class__heading.narrow").text().trim(),
            sections: [],
            description: $course
                .find(".scpi-class__details--content")
                .text()
                .trim(),
            level: $course.find(".scpi-class__details--title").text().trim(),
        };

        if (course.id === undefined) {
            course.id = randomUUID();
        }

        if (course.units.startsWith("Variable")) {
            course.units = null;
        } else {
            course.units = parseInt(course.units.split("")[0]);
        }

        $course.find(".scpi-class__data").each((_, sectionEl) => {
            const $section = $(sectionEl);
            const section = {
                id: $section.attr("data-section-id") || "",
                number: "",
                term: "",
                instructor: "",
                delivery: "",
                days: "",
                time: "",
                seats: "",
            };

            section.number = $section
                .find('[class*="value-section-number"]')
                .text()
                .trim();

            section.term = $section.find('[class*="value-term"]').text().trim();

            section.instructor = $section
                .find('[class*="value-instructor"]')
                .text()
                .replace(/\s+/g, " ")
                .trim()
                .split(";")
                .map((v) => v.trim());

            section.delivery = $section
                .find('[class*="value-delivery-mode"]')
                .text()
                .trim();

            section.days =
                $section.find('[class*="value-days"]').text().trim() ||
                undefined;
            if (section.days) {
                section.days = section.days.split(" ");
            }

            section.time = $section
                .find('[class*="value-time"]')
                .text()
                .replace(/\s+/g, " ")
                .trim();

            if (section.time === "") {
                section.time = null;
            } else {
                section.time = section.time.split("-").map((v) => {
                    const [timestr, ampm] = v.trim().split(" ");
                    const [h, m] = timestr.split(":");
                    let h24 = parseInt(h) % 12;
                    if (ampm === "PM") {
                        h24 += 12;
                    }

                    return h24 * 60 + parseInt(m);
                });
            }
            section.seats = $section
                .find('[class*="value-seating"]')
                .text()
                .replace(/\s+/g, " ")
                .trim();

            if (section.seats.startsWith("Waitlist")) {
                section.seats = null;
            } else {
                section.seats = section.seats
                    .split("/")
                    .map((v) => parseInt(v.trim()));
            }

            course.sections.push(section);
        });

        // Courses have letter sections and number sections. Lecture-only courses can have
        // either numbered or letter sections, but not both. If a course has both, the lab
        // is generally lettered and the lecture is generally numbered. "Lab" generically refers
        // to discussions, seminars, tutorials, etc.
        let numSections = course.sections.filter(
            (section) => !isNaN(parseInt(section.number)),
        );
        let letterSections = course.sections.filter((section) =>
            isNaN(parseInt(section.number)),
        );
        if (numSections.length > 0 && letterSections.length > 0) {
            course.sections = {
                lecture: numSections,
                lab: letterSections,
            };
        } else {
            course.sections = {
                lecture: numSections,
            };
        }
        courses.push(course);
    });

    return courses;
};

const CATALOG_URL =
    "https://registrar.washu.edu/classes-registration/class-schedule-search/";

/**
 * Parse schools and departments from an AJAX response HTML.
 */
const parseDropdowns = (html) => {
    const $ = cheerio.load(html);
    const schools = [];
    $("#schoolselect option").each((_, el) => {
        const val = $(el).attr("value");
        if (val) schools.push(val);
    });
    const depts = [];
    $("#departmentselect option").each((_, el) => {
        const val = $(el).attr("value");
        if (val) depts.push(val);
    });
    return { schools, depts };
};

/**
 * Scrape the list of schools available for a given term.
 */
const scrapeSchools = async (term) => {
    // POST with an arbitrary school to get the response for this term;
    // the school dropdown in the response lists all schools for the term.
    const html = await downloadCatalog(term, "Arts & Sciences", undefined);
    const { schools } = parseDropdowns(html);
    return schools;
};

/**
 * Scrape the list of departments for a given term and school.
 * Returns an empty array if the school has no department subdivisions.
 */
const scrapeDepartments = async (term, school) => {
    const html = await downloadCatalog(term, school, undefined);
    const { depts } = NO_DEPARTMENT_SCHOOLS.has(school)
        ? { depts: [] }
        : parseDropdowns(html);
    return { depts, html };
};

/**
 * Download the registrar's course catalog page for the specified term, school and, optionally, department.
 */
const downloadCatalog = async (term, school, dept) => {
    const body = {
        term: term,
        school: school,
    };

    if (dept) {
        body.department = dept;
    }

    const res = await fetch(CATALOG_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            Accept: "*/*",
            "X-Requested-With": "XMLHttpRequest",
        },
        body: new URLSearchParams(body).toString(),
    });

    if (!res.ok) {
        throw Error(
            `Failed to download catalog for school: ${school} department: ${dept} term: ${term}. Status: ${
                res.status
            }, ${res.statusText}.\n${await res.text()}`,
        );
    }

    return await res.text();
};

const main = async () => {
    fs.mkdirSync(config.dataDir, { recursive: true });
    let terms = config.terms;
    let allTerms = config.terms.map((term) => term.name);

    const indexPath = path.resolve(config.dataDir, "index.json");
    if (fs.existsSync(indexPath)) {
        const index = JSON.parse(fs.readFileSync(indexPath));
        terms = terms.filter(
            (term) => !index.terms.includes(term.name) || term.active,
        );
    }

    terms = terms.map((term) => term.name);
    for (const term of terms) {
        console.log(`Scraping catalog for ${term}`);
        const schoolNames = await scrapeSchools(term);
        console.log(`\tFound ${schoolNames.length} schools`);
        const courses = [];
        const schools = {};
        for (const school of schoolNames) {
            const displayName =
                school === "Washington University in St. Louis"
                    ? "Other"
                    : school;
            console.log(`\t${school}`);
            const { depts, html } = await scrapeDepartments(term, school);
            schools[displayName] = depts;
            if (depts.length > 0) {
                for (const dept of depts) {
                    console.log(`\t\t${dept}`);
                    const catalog = await downloadCatalog(term, school, dept);
                    courses.push(...parseCatalog(catalog, school));
                }
            } else {
                // If there are no departments, the initial fetch contains all courses.
                courses.push(...parseCatalog(html, school));
            }
        }

        fs.writeFileSync(
            resolve(config.dataDir, `${term}.json`),
            JSON.stringify({
                courses: courses,
                instructors: (() => {
                    const map = {};
                    for (const course of courses) {
                        const all = [
                            ...course.sections.lecture.flatMap(
                                (s) => s.instructor,
                            ),
                            ...(course.sections.lab?.flatMap(
                                (s) => s.instructor,
                            ) ?? []),
                        ];
                        for (const name of new Set(all)) {
                            (map[name] ??= []).push(course.id);
                        }
                    }
                    return map;
                })(),
                schools: schools,
                lastUpdated: Date.now(),
            }),
        );
    }

    fs.writeFileSync(
        resolve(config.dataDir, "index.json"),
        JSON.stringify({
            terms: allTerms,
        }),
    );
};

await main();
