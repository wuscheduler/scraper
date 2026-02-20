# WUScheduler Scraper

This repo hosts a simple, periodic web scraper that crawls the Registrar website and turns the data into JSON for WUScheduler to consume.

The scraper produces a JSON file for each term listed in `config.js`. The output is stored in `./data` and served via Github Pages.