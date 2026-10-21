# osobní vlk! :3

> Preface: In Czechia, slow / passenger trains are referred to as "osobní vlak"! Change just one letter, and "vlak" turns into "vlk" - or wolf! While, sadly, not many people can afford to have personal wolves, anyone can map their train journeys! To make this as easy as possible, I made this!

Hi! Welcome, if you're reading this, chances are you're fond of trains! :yay:

Osobní vlk is a **train mapping platform** built *entirely in vanilla HTML/CSS/JS* that works for the entirety of Europe and up to a month and a half in the past, and up to three months in advance, meaning you can PERMANENTLY map all of your trip journeys - for free!!

This idea came to me as I was riding on a Czech B249 towards Germany, and thought, "Wow, I have no life. I really need to record every single train I've ever taken..."

## Technical Background

Anyways, this mapping app is, actually, quite simple! It uses a simple server-side DB hosted on nest with some basic ratelimiting, and signing in with a username is enough to configure your trains! (I doubt enough people are using this that there will be two stinkyzsharpminor67s, but who knows, a password feature may be an addition to this soon!)

The connection search relies on a free and publically available Transituous API, which incorporates GTFS data to spit out connections including vias and filtering by train type!

A large portion of my weekends are spent riding random regional trains in Germany with the Deutschland-Ticket (Germany-Ticket), so I made this app have a filter for only D-Ticket eligible trains as well as only FlixTrains and FlixBuses! Additionally, some big cities such as Berlin, Dresden, Vienna, and Prague also have increased accuracy with mapped providers and unique colors per metro line!

I can't wait to drive the same route over and over again 200 times just to make the color a bit deeper... and who knows? Maybe an easter egg might appear ;3

## Usage

To use osobní vlk, simply open up [https://sharp.hackclub.app/osobni-vlk/](https://sharp.hackclub.app/osobni-vlk/) and enter your connection and date! Be aware that this data is only reliable about 1.5 months into the past and about 3-4 months in advance as train data changes! Also, this usually will incorporate delays and last-minute changes, but for some countries such as Denmark, who don't publish this in an open-source format, your train will (falsely) be shown normally :C

## Closing Notes

A Note on Design and AI Disclosure: I tried to have the design be inspired by websites before AI, and I'm happy to report that none of the HTML or CSS contain any AI assistance. For transparency, AI was used to create my array of 100 EU-wide station providers in the JS, as well as two helper functions: one which filters out FlixTrains from the Transitous API, and one which tracks the curvature of your train and draws it on the map. Including the station providers, about 20% of the code and 15% of the time spent on this project is AI. Excluding station providers, that goes down to about 10% and 10%, respectively.