(function () {
    const width = 750, height = 580;

    const svg = d3.select("#map-container")
        .append("svg")
        .attr("width", width).attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g");
    const tooltip = d3.select("#tooltip");

    const LON_MIN = -125.0, LON_MAX = -113.75;
    const LAT_MIN = 32.513, LAT_MAX = 41.937;

    const projection = d3.geoMercator()
        .scale(2463)
        .translate([5512, 2024]);

    const path = d3.geoPath().projection(projection);

    const px0 = projection([LON_MIN, LAT_MIN]);
    const px1 = projection([LON_MIN + 1.25, LAT_MIN]);
    const py1 = projection([LON_MIN, LAT_MIN + 0.95]);
    const cellW = Math.abs(px1[0] - px0[0]) + 1.5;
    const cellH = Math.abs(py1[1] - px0[1]) + 1.5;

    // Absolute temperature scale — fixed across all years so colours are comparable
    // Domain: 9°C (cool blue) → 26°C (hot red)
    const colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([9, 26]);

    svg.call(d3.zoom()
        .scaleExtent([1, 12])
        .translateExtent([[-width, -height], [2 * width, 2 * height]])
        .on("zoom", e => g.attr("transform", e.transform)));

    // ── SLIDER ────────────────────────────────────────────────────────────
    const slider      = document.getElementById("year-slider");
    const yearDisplay = document.getElementById("year-display");

    slider.addEventListener("input", function () {
        const y = +this.value;
        yearDisplay.textContent = y;
        updateStory(y);
        highlightTrendYear(y);
        if (window._masterData) updateMap(y);
    });

    function updateStory(year) {
        document.querySelectorAll(".story-card").forEach(card => {
            card.classList.toggle("active", +card.dataset.year === year);
        });
    }

    // ── LEGEND ────────────────────────────────────────────────────────────
    function buildLegend() {
        const legendW = 200;
        const defs = svg.append("defs");
        const grad = defs.append("linearGradient").attr("id", "temp-gradient");
        grad.selectAll("stop")
            .data(d3.range(0, 1.01, 0.05))
            .enter().append("stop")
            .attr("offset",     d => (d * 100) + "%")
            .attr("stop-color", d => colorScale(9 + d * 17));

        const legend = svg.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(16, ${height - 52})`);

        legend.append("rect")
            .attr("width", legendW).attr("height", 12)
            .style("fill", "url(#temp-gradient)")
            .style("stroke", "#555").style("stroke-width", "0.5");

        legend.append("text").attr("x", 0).attr("y", -7)
            .attr("class", "legend-title")
            .text("ABSOLUTE TEMPERATURE (°C)");

        legend.append("text").attr("x", 0).attr("y", 28).text("9°C Cool");
        legend.append("text").attr("x", legendW).attr("y", 28)
            .attr("text-anchor", "end").text("26°C Hot");
    }

    // ── MAP UPDATE ────────────────────────────────────────────────────────
    function updateMap(year) {
        const yearData = window._masterData.filter(d => d.year === year);

        g.selectAll(".grid-point").remove();

        g.selectAll(".grid-point")
            .data(yearData)
            .enter().append("rect")
            .attr("class", "grid-point")
            .attr("x", d => { const p = projection([d.lon, d.lat]); return p ? p[0] - cellW/2 : -9999; })
            .attr("y", d => { const p = projection([d.lon, d.lat]); return p ? p[1] - cellH/2 : -9999; })
            .attr("width", cellW).attr("height", cellH)
            .attr("fill", d => colorScale(d.temperature_C))
            .on("mouseover", function (event, d) {
                tooltip.style("opacity", 1).html(
                    `<strong>${d.year}</strong><br>
                     Lat ${d.lat.toFixed(2)}°, Lon ${d.lon.toFixed(2)}°<br>
                     Temp: <strong>${d.temperature_C.toFixed(2)} °C</strong> (${(d.temperature_C * 9/5 + 32).toFixed(1)} °F)`
                );
                d3.select(this).raise();
            })
            .on("mousemove", function (event) {
                const [mx, my] = d3.pointer(event, document.getElementById("map-container"));
                tooltip.style("left", (mx + 15) + "px").style("top", (my - 20) + "px");
            })
            .on("mouseout", () => tooltip.style("opacity", 0));

        g.selectAll(".ca-border").raise();
    }

    // ── STATUS ────────────────────────────────────────────────────────────
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
        if (!msg) { el.remove(); }
    }

    // ── LOAD ──────────────────────────────────────────────────────────────
    setStatus("Loading map data…");

    Promise.all([
        d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
        d3.json("ca_temps.json")
    ]).then(([us, caData]) => {
        setStatus("");

        const states = topojson.feature(us, us.objects.states);
        const caFeature = states.features.find(f => f.id === "06");

        if (caFeature) {
            g.append("path").datum(caFeature).attr("class", "ca-fill").attr("d", path);
            g.append("path").datum(caFeature).attr("class", "ca-border").attr("d", path);
        }

        window._masterData = caData;
        window._baselineLookup = {};
        caData.filter(d => d.year === 2015)
              .forEach(d => { window._baselineLookup[`${d.lat}-${d.lon}`] = d.temperature_C; });

        buildLegend();
        updateMap(2015);
    }).catch(err => {
        console.error("Load error:", err);
        setStatus("Error loading data — check the browser console (F12).", true);
    });

    // ── TREND LINE CHART ──────────────────────────────────────────────────
    // Called after trend data loads; also exports highlightTrendYear globally
    window.buildTrendChart = function(trendData) {
        const margin = { top: 30, right: 30, bottom: 50, left: 65 };
        const cw = 750 - margin.left - margin.right;
        const ch = 280 - margin.top - margin.bottom;

        const svg2 = d3.select("#trend-chart")
            .append("svg")
            .attr("width", cw + margin.left + margin.right)
            .attr("height", ch + margin.top + margin.bottom)
            .attr("viewBox", `0 0 ${cw + margin.left + margin.right} ${ch + margin.top + margin.bottom}`)
            .attr("preserveAspectRatio", "xMidYMid meet");

        const chart = svg2.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const x = d3.scaleLinear().domain([2015, 2025]).range([0, cw]);

        const allAvg = trendData.map(d => d.avg);
        const y = d3.scaleLinear()
            .domain([d3.min(allAvg) - 0.4, d3.max(allAvg) + 0.4])
            .range([ch, 0]);

        // Grid lines
        y.ticks(5).forEach(tick => {
            chart.append("line")
                .attr("x1", 0).attr("x2", cw)
                .attr("y1", y(tick)).attr("y2", y(tick))
                .attr("stroke", "#ffffff10").attr("stroke-width", 1);
        });

        // Shaded area
        const area = d3.area()
            .x(d => x(d.year))
            .y0(ch)
            .y1(d => y(d.avg))
            .curve(d3.curveMonotoneX);

        chart.append("path")
            .datum(trendData)
            .attr("fill", "rgba(243,156,18,0.15)")
            .attr("d", area);

        // Line
        const line = d3.line()
            .x(d => x(d.year))
            .y(d => y(d.avg))
            .curve(d3.curveMonotoneX);

        chart.append("path")
            .datum(trendData)
            .attr("fill", "none")
            .attr("stroke", "#f39c12")
            .attr("stroke-width", 2.5)
            .attr("d", line);

        // Annotations
        const events = [
            { year: 2018, label: "Camp Fire", dy: 22 },
            { year: 2020, label: "Record wildfires", dy: 22 },
            { year: 2021, label: "Hottest year", dy: -22 }
        ];

        events.forEach(ev => {
            const d = trendData.find(t => t.year === ev.year);
            if (!d) return;
            const cx = x(ev.year), cy = y(d.avg);
            chart.append("line")
                .attr("x1", cx).attr("x2", cx)
                .attr("y1", cy).attr("y2", cy + ev.dy)
                .attr("stroke", "#f39c12").attr("stroke-width", 1)
                .attr("stroke-dasharray", "3 2");
            chart.append("text")
                .attr("x", cx).attr("y", cy + ev.dy + (ev.dy < 0 ? -5 : 13))
                .attr("text-anchor", "middle")
                .attr("fill", "#f39c12").attr("font-size", "10px")
                .attr("font-family", "Nunito, system-ui")
                .text(ev.label);
        });

        // Dots coloured by temperature
        const dotScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([14.5, 16.5]);

        chart.selectAll(".trend-dot")
            .data(trendData)
            .enter().append("circle")
            .attr("class", "trend-dot")
            .attr("cx", d => x(d.year))
            .attr("cy", d => y(d.avg))
            .attr("r", 6)
            .attr("fill", d => dotScale(d.avg))
            .attr("stroke", "#1a2a3a").attr("stroke-width", 1.5);

        // Axes
        chart.append("g")
            .attr("transform", `translate(0,${ch})`)
            .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(11))
            .selectAll("text").attr("fill", "#adc8e0").attr("font-size", "11px");

        chart.append("g")
            .call(d3.axisLeft(y).ticks(5).tickFormat(d => d.toFixed(1) + "°C"))
            .selectAll("text").attr("fill", "#adc8e0").attr("font-size", "11px");

        chart.selectAll(".domain, .tick line").attr("stroke", "#334");

        chart.append("text")
            .attr("x", cw / 2).attr("y", ch + 42)
            .attr("text-anchor", "middle")
            .attr("fill", "#6a8aaa").attr("font-size", "11px")
            .attr("font-family", "Nunito, system-ui").text("Year");

        chart.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -ch / 2).attr("y", -52)
            .attr("text-anchor", "middle")
            .attr("fill", "#6a8aaa").attr("font-size", "11px")
            .attr("font-family", "Nunito, system-ui")
            .text("Avg Temperature (°C)");

        // Year indicator linked to slider
        const yearLine = chart.append("line")
            .attr("y1", 0).attr("y2", ch)
            .attr("stroke", "white").attr("stroke-width", 1.5)
            .attr("stroke-dasharray", "4 3").attr("opacity", 0.6);

        const yearDot = chart.append("circle")
            .attr("r", 8).attr("fill", "white").attr("opacity", 0.9)
            .attr("stroke", "#1a2a3a").attr("stroke-width", 2);

        window.highlightTrendYear = function(year) {
            const d = trendData.find(t => t.year === year);
            if (!d) return;
            const cx = x(year), cy = y(d.avg);
            yearLine.attr("x1", cx).attr("x2", cx);
            yearDot.attr("cx", cx).attr("cy", cy).attr("fill", dotScale(d.avg));
        };

        window.highlightTrendYear(2015);
    };


    // Default no-op until chart loads
    window.highlightTrendYear = function() {};

})();
