(function () {
    const width = 750, height = 580, padding = 50;

    // ── SVG SETUP ──────────────────────────────────────────────────────────
    const svg = d3.select("#map-container")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g");
    const tooltip = d3.select("#tooltip");

    // ── PROJECTION ─────────────────────────────────────────────────────────
    // Bounding box of actual data points
    const LON_MIN = -125.0, LON_MAX = -113.75;
    const LAT_MIN = 32.513, LAT_MAX = 41.937;

    // Hardcoded Mercator projection tuned to fill the SVG with California.
    // scale=3514 fits the ~11.25° lon span of CA into the SVG width.
    // translate is computed so lon=-119.5, lat=37.2 lands at SVG center.
    const projection = d3.geoMercator()
        .scale(2463)
        .translate([5512, 2024]);

    const path = d3.geoPath().projection(projection);

    // Cell size derived from the actual 1.25° grid spacing
    const px0 = projection([LON_MIN, LAT_MIN]);
    const px1 = projection([LON_MIN + 1.25, LAT_MIN]);
    const py1 = projection([LON_MIN, LAT_MIN + 0.95]);
    const cellW = Math.abs(px1[0] - px0[0]) + 1.5;
    const cellH = Math.abs(py1[1] - px0[1]) + 1.5;

    // ── COLOUR SCALE ───────────────────────────────────────────────────────
    // domain [positive, negative] → red = warm, blue = cool
    const colorScale = d3.scaleSequential(d3.interpolateRdBu).domain([2.5, -2.5]);

    // ── ZOOM — locked to CA, minimum scale 1 so it can't zoom out ──────────
    const zoom = d3.zoom()
        .scaleExtent([1, 12])
        .translateExtent([[-width, -height], [2 * width, 2 * height]])
        .on("zoom", e => g.attr("transform", e.transform));
    svg.call(zoom);
    // Start zoomed in — no initial transform needed since fitExtent already fills SVG

    // ── SLIDER ─────────────────────────────────────────────────────────────
    const slider      = document.getElementById("year-slider");
    const yearDisplay = document.getElementById("year-display");

    slider.addEventListener("input", function () {
        const y = +this.value;
        yearDisplay.textContent = y;
        updateStory(y);
        if (window._masterData) updateMap(y);
    });

    function updateStory(year) {
        document.querySelectorAll(".story-card").forEach(card => {
            card.classList.toggle("active", +card.dataset.year === year);
        });
    }

    // ── LEGEND ─────────────────────────────────────────────────────────────
    function buildLegend() {
        const legendW = 200;
        const defs = svg.append("defs");
        const grad = defs.append("linearGradient").attr("id", "temp-gradient");

        grad.selectAll("stop")
            .data(d3.range(0, 1.01, 0.05))
            .enter().append("stop")
            .attr("offset",     d => (d * 100) + "%")
            .attr("stop-color", d => colorScale(-2.5 + d * 5));

        const legend = svg.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(16, ${height - 52})`);

        legend.append("rect")
            .attr("width", legendW).attr("height", 12)
            .style("fill", "url(#temp-gradient)")
            .style("stroke", "#555").style("stroke-width", "0.5");

        legend.append("text").attr("x", 0).attr("y", -7)
            .attr("class", "legend-title")
            .text("TEMPERATURE ANOMALY vs. 2015");

        legend.append("text").attr("x", 0).attr("y", 28).text("−2.5°C Cooler");
        legend.append("text").attr("x", legendW).attr("y", 28)
            .attr("text-anchor", "end").text("Warmer +2.5°C");
    }

    // ── MAP UPDATE ─────────────────────────────────────────────────────────
    function updateMap(year) {
        const baseline = window._baselineLookup;
        const yearData = window._masterData.filter(d => d.year === year);

        g.selectAll(".grid-point").remove();

        g.selectAll(".grid-point")
            .data(yearData)
            .enter().append("rect")
            .attr("class", "grid-point")
            .attr("x", d => {
                const p = projection([d.lon, d.lat]);
                return p ? p[0] - cellW / 2 : -9999;
            })
            .attr("y", d => {
                const p = projection([d.lon, d.lat]);
                return p ? p[1] - cellH / 2 : -9999;
            })
            .attr("width",  cellW)
            .attr("height", cellH)
            .attr("fill", d => {
                const base = baseline[`${d.lat}-${d.lon}`];
                return base != null ? colorScale(d.temperature_C - base) : "#555";
            })
            .on("mouseover", function (event, d) {
                const base = window._baselineLookup[`${d.lat}-${d.lon}`];
                const anom = (d.temperature_C - base).toFixed(2);
                const sign = anom > 0 ? "+" : "";
                tooltip.style("opacity", 1).html(
                    `<strong>${d.year}</strong><br>
                     Lat ${d.lat.toFixed(2)}°, Lon ${d.lon.toFixed(2)}°<br>
                     Anomaly vs 2015: <strong>${sign}${anom} °C</strong><br>
                     <span style="color:#aaa;font-size:11px">Temp: ${d.temperature_C.toFixed(2)} °C</span>`
                );
                d3.select(this).raise();
            })
            .on("mousemove", function (event) {
                const [mx, my] = d3.pointer(event, document.getElementById("map-container"));
                tooltip.style("left", (mx + 15) + "px").style("top", (my - 20) + "px");
            })
            .on("mouseout", () => tooltip.style("opacity", 0));

        // Keep CA border on top of data points
        g.selectAll(".ca-border").raise();
    }

    // ── STATUS HELPER ──────────────────────────────────────────────────────
    function setStatus(msg, isError) {
        let el = document.getElementById("map-status");
        if (!el) {
            el = document.createElement("p");
            el.id = "map-status";
            el.style.cssText = "color:#fff;padding:1rem;font-size:14px;position:absolute;top:10px;left:10px;z-index:20;background:rgba(0,0,0,0.7);border-radius:4px;";
            document.getElementById("map-container").appendChild(el);
        }
        el.textContent = msg;
        el.style.color = isError ? "#ff6b6b" : "#ffb142";
        if (!msg) el.remove();
    }

    // ── LOAD ───────────────────────────────────────────────────────────────
    setStatus("Loading map data…");

    Promise.all([
        d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
        d3.json("ca_temps.json")
    ]).then(([us, caData]) => {

        setStatus("");   // clear loading message

        // ── Draw only California ──
        const states = topojson.feature(us, us.objects.states);
        const caFeature = states.features.find(f => f.id === "06");

        if (caFeature) {
            // Background fill so CA shape is visible
            g.append("path")
                .datum(caFeature)
                .attr("class", "ca-fill")
                .attr("d", path);

            // Separate border path, raised above data points at the end
            g.append("path")
                .datum(caFeature)
                .attr("class", "ca-border")
                .attr("d", path);
        }

        // ── Prepare data ──
        window._masterData = caData;

        window._baselineLookup = {};
        caData.filter(d => d.year === 2015)
              .forEach(d => { window._baselineLookup[`${d.lat}-${d.lon}`] = d.temperature_C; });

        buildLegend();
        updateMap(2015);

    }).catch(err => {
        console.error("Load error:", err);
        setStatus("Error loading data — check the browser console (F12) for details.", true);
    });

})();