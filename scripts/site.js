(function () {
  var owner = "hotdog7799";
  var repo = "research";
  var branch = "main";

  var tbody = document.getElementById("report-body");
  var status = document.getElementById("report-status");
  var tabsEl = document.getElementById("project-tabs");
  var searchEl = document.getElementById("search");
  var countEl = document.getElementById("count");
  var table = document.getElementById("report-table");

  if (!tbody || !table) {
    return;
  }

  var state = {
    all: [],
    project: "all",
    query: "",
    sortKey: "date",
    sortDir: "desc",
  };

  // ---- helpers -------------------------------------------------------------

  function textFrom(doc, selector) {
    var node = doc.querySelector(selector);
    return node ? node.textContent.trim() : "";
  }

  function metaFrom(doc, name) {
    var node = doc.querySelector('meta[name="' + name + '"]');
    return node ? (node.getAttribute("content") || "").trim() : "";
  }

  function titleFromSlug(slug) {
    return slug
      .split("-")
      .filter(Boolean)
      .map(function (part) {
        return part.slice(0, 1).toUpperCase() + part.slice(1);
      })
      .join(" ");
  }

  function fetchText(url) {
    return fetch(url).then(function (response) {
      if (!response.ok) {
        throw new Error("Unable to load " + url);
      }
      return response.text();
    });
  }

  // ---- discovery -----------------------------------------------------------

  function discoverFromGitHub() {
    var url = "https://api.github.com/repos/" + owner + "/" + repo + "/contents/projects?ref=" + branch;
    return fetch(url)
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Unable to discover projects from GitHub");
        }
        return response.json();
      })
      .then(function (items) {
        return items
          .filter(function (item) {
            return item.type === "dir";
          })
          .map(function (item) {
            return item.name;
          });
      });
  }

  function discoverFromDirectoryListing() {
    return fetchText("projects/").then(function (html) {
      var doc = new DOMParser().parseFromString(html, "text/html");
      return Array.from(doc.querySelectorAll("a"))
        .map(function (link) {
          return link.getAttribute("href") || "";
        })
        .filter(function (href) {
          return href && href !== "../" && href.slice(-1) === "/";
        })
        .map(function (href) {
          return href.replace(/\/$/, "");
        });
    });
  }

  function discoverProjects() {
    return discoverFromGitHub()
      .catch(discoverFromDirectoryListing)
      .then(function (slugs) {
        return Array.from(new Set(slugs)).sort();
      });
  }

  // ---- commit metadata (fallback date only) --------------------------------

  function commitUrlFor(slug) {
    var path = encodeURIComponent("projects/" + slug);
    return (
      "https://api.github.com/repos/" + owner + "/" + repo +
      "/commits?sha=" + branch + "&path=" + path + "&per_page=1"
    );
  }

  function readLastCommitDate(slug) {
    return fetch(commitUrlFor(slug))
      .then(function (response) {
        if (!response.ok) {
          throw new Error("no commit metadata");
        }
        return response.json();
      })
      .then(function (items) {
        var commit = items && items[0];
        var date = commit && commit.commit && commit.commit.committer && commit.commit.committer.date;
        return date ? date.slice(0, 10) : "";
      })
      .catch(function () {
        return "";
      });
  }

  // ---- per-project record --------------------------------------------------

  function readProject(slug) {
    var path = "projects/" + slug + "/";
    return fetchText(path + "index.html")
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        var record = {
          slug: slug,
          title: textFrom(doc, "h1") || textFrom(doc, "title") || titleFromSlug(slug),
          project: metaFrom(doc, "report:project") || "uncategorized",
          date: metaFrom(doc, "report:date"),
          model: metaFrom(doc, "report:model"),
          href: path + "index.html",
        };
        // Only pay for a commit lookup when the report has no explicit date.
        if (record.date) {
          return record;
        }
        return readLastCommitDate(slug).then(function (date) {
          record.date = date;
          return record;
        });
      });
  }

  // ---- rendering -----------------------------------------------------------

  function projectLabel(project) {
    return project === "all" ? "전체" : project;
  }

  function buildTabs() {
    var projects = Array.from(
      new Set(
        state.all.map(function (r) {
          return r.project;
        })
      )
    ).sort();
    var tabs = ["all"].concat(projects);

    tabsEl.innerHTML = "";
    tabs.forEach(function (project) {
      var count = project === "all"
        ? state.all.length
        : state.all.filter(function (r) { return r.project === project; }).length;

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tab" + (project === state.project ? " is-active" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", project === state.project ? "true" : "false");
      btn.dataset.project = project;
      btn.innerHTML =
        '<span class="tab-label">' + projectLabel(project) + "</span>" +
        '<span class="tab-count">' + count + "</span>";
      btn.addEventListener("click", function () {
        state.project = project;
        buildTabs();
        renderRows();
      });
      tabsEl.appendChild(btn);
    });
  }

  function compare(a, b) {
    var key = state.sortKey;
    var av = (a[key] || "").toString().toLowerCase();
    var bv = (b[key] || "").toString().toLowerCase();
    var res;
    if (av < bv) {
      res = -1;
    } else if (av > bv) {
      res = 1;
    } else {
      res = a.slug.localeCompare(b.slug);
    }
    return state.sortDir === "asc" ? res : -res;
  }

  function currentRows() {
    var q = state.query.trim().toLowerCase();
    return state.all
      .filter(function (r) {
        return state.project === "all" || r.project === state.project;
      })
      .filter(function (r) {
        if (!q) {
          return true;
        }
        return (
          r.title.toLowerCase().indexOf(q) !== -1 ||
          r.project.toLowerCase().indexOf(q) !== -1 ||
          (r.model || "").toLowerCase().indexOf(q) !== -1
        );
      })
      .slice()
      .sort(compare);
  }

  function projectClass(project) {
    // Stable colour bucket per project name without random/Date.
    var sum = 0;
    for (var i = 0; i < project.length; i += 1) {
      sum = (sum + project.charCodeAt(i)) % 6;
    }
    return "pill pill-" + sum;
  }

  function renderRows() {
    var rows = currentRows();
    tbody.innerHTML = "";

    if (countEl) {
      countEl.textContent = rows.length + "개";
    }

    if (!rows.length) {
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 5;
      td.className = "empty-state";
      td.textContent = "표시할 리포트가 없어요.";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    rows.forEach(function (r) {
      var tr = document.createElement("tr");

      var tdProject = document.createElement("td");
      tdProject.className = "col-project";
      var pill = document.createElement("span");
      pill.className = projectClass(r.project);
      pill.textContent = r.project;
      tdProject.setAttribute("data-label", "Project");
      tdProject.appendChild(pill);

      var tdDate = document.createElement("td");
      tdDate.className = "col-date";
      tdDate.setAttribute("data-label", "Date");
      if (r.date) {
        var time = document.createElement("time");
        time.dateTime = r.date;
        time.textContent = r.date;
        tdDate.appendChild(time);
      } else {
        tdDate.textContent = "—";
      }

      var tdModel = document.createElement("td");
      tdModel.className = "col-model";
      tdModel.setAttribute("data-label", "Model");
      tdModel.textContent = r.model || "—";

      var tdTitle = document.createElement("td");
      tdTitle.className = "col-title";
      tdTitle.setAttribute("data-label", "Title");
      var titleLink = document.createElement("a");
      titleLink.href = r.href;
      titleLink.className = "title-link";
      titleLink.textContent = r.title;
      tdTitle.appendChild(titleLink);

      var tdOpen = document.createElement("td");
      tdOpen.className = "col-open";
      var open = document.createElement("a");
      open.href = r.href;
      open.className = "open-link";
      open.textContent = "열기 →";
      tdOpen.appendChild(open);

      tr.append(tdProject, tdDate, tdModel, tdTitle, tdOpen);
      tbody.appendChild(tr);
    });
  }

  function updateSortIndicators() {
    Array.from(table.querySelectorAll("th[data-sort]")).forEach(function (th) {
      var key = th.getAttribute("data-sort");
      th.classList.toggle("sort-asc", state.sortKey === key && state.sortDir === "asc");
      th.classList.toggle("sort-desc", state.sortKey === key && state.sortDir === "desc");
      th.setAttribute(
        "aria-sort",
        state.sortKey === key ? (state.sortDir === "asc" ? "ascending" : "descending") : "none"
      );
    });
  }

  function wireSorting() {
    Array.from(table.querySelectorAll("th[data-sort]")).forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-sort");
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = key;
          // Dates default newest-first; text columns default A→Z.
          state.sortDir = key === "date" ? "desc" : "asc";
        }
        updateSortIndicators();
        renderRows();
      });
    });
  }

  function wireSearch() {
    if (!searchEl) {
      return;
    }
    searchEl.addEventListener("input", function () {
      state.query = searchEl.value;
      renderRows();
    });
  }

  // ---- boot ----------------------------------------------------------------

  wireSorting();
  wireSearch();
  updateSortIndicators();

  discoverProjects()
    .then(function (slugs) {
      return Promise.all(slugs.map(readProject));
    })
    .then(function (records) {
      state.all = records;
      buildTabs();
      renderRows();
    })
    .catch(function () {
      if (status) {
        status.textContent = "리포트를 불러오지 못했어요.";
      }
    });
})();
