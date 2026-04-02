import * as fs from "node:fs";

const allCounts = JSON.parse(fs.readFileSync("./data/counts.json"));
fs.globSync("data/*.json")
    .filter((x) => x != "data/index.json" && x != "data/counts.json")
    .forEach((file) => {
        const term = file.split("/")[1].split(".")[0];
        console.log(term);
        const counts = allCounts[term];
        if (!counts) return;
        const courses = JSON.parse(fs.readFileSync(file).toString())["courses"];
        Object.keys(counts).forEach((school) => {
            const n = courses
                .filter((c) => c["school"] === school)
                .reduce(
                    (count, course) =>
                        count +
                        course["sections"]["lecture"].length +
                        (course["sections"]["lab"] || []).length,
                    0,
                );

            const matches = n === counts[school];
            console.log(
                `\t${school}: ${n} (${matches ? "Match" : `Error, expected ${counts[school]}`})`,
            );
        });
    });
