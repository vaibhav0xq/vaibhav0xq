const login = process.env.PROFILE_LOGIN || 'vaibhav0xq';
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!token) {
  throw new Error('GITHUB_TOKEN or GH_TOKEN is required to generate profile stats.');
}

const now = new Date();
const from = new Date(now);
from.setFullYear(from.getFullYear() - 1);

const graphQuery = `
  query ProfileStats($login: String!, $from: DateTime!, $to: DateTime!, $after: String) {
    user(login: $login) {
      createdAt
      name
      pullRequests { totalCount }
      issues { totalCount }
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        totalIssueContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        totalRepositoryContributions
        restrictedContributionsCount
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
        commitContributionsByRepository(maxRepositories: 100) { repository { name } }
        pullRequestContributionsByRepository(maxRepositories: 100) { repository { name } }
        issueContributionsByRepository(maxRepositories: 100) { repository { name } }
      }
      repositories(first: 100, after: $after, ownerAffiliations: OWNER, privacy: PUBLIC, orderBy: {field: UPDATED_AT, direction: DESC}) {
        pageInfo { hasNextPage endCursor }
        nodes {
          name
          description
          url
          isFork
          stargazerCount
          primaryLanguage { name color }
          languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
            edges { size node { name color } }
          }
        }
      }
    }
  }
`;

const contributionQuery = `
  query ContributionWindow($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        totalIssueContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        totalRepositoryContributions
        restrictedContributionsCount
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`;
async function githubGraphQL(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'vaibhav0xq-profile-stats'
    },
    body: JSON.stringify({ query, variables })
  });

  const body = await res.json();
  if (!res.ok || body.errors) {
    throw new Error(JSON.stringify(body.errors || body, null, 2));
  }
  return body.data;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function compact(value) {
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function svgShell(width, height, inner) {
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .label{font:700 13px ui-monospace,SFMono-Regular,Menlo,monospace;fill:#D6E4F0}
    .muted{font:700 11px ui-monospace,SFMono-Regular,Menlo,monospace;fill:#8BA3B5}
    .title{font:800 18px system-ui,-apple-system,Segoe UI,sans-serif;fill:#FBBF24}
    .num{font:900 28px system-ui,-apple-system,Segoe UI,sans-serif;fill:#58A6FF}
    .tiny{font:800 10px ui-monospace,SFMono-Regular,Menlo,monospace;fill:#F59E0B}
  </style>
  <rect width="${width}" height="${height}" rx="14" fill="#0D1117"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="13" stroke="#243247"/>
  <rect x="0" y="0" width="${width}" height="${height}" rx="14" fill="url(#glow)" opacity=".55"/>
  <defs>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${width * 0.76} ${height * 0.08}) rotate(132) scale(${width * 0.8} ${height * 0.9})">
      <stop stop-color="#F97316" stop-opacity=".26"/>
      <stop offset=".36" stop-color="#0D1117" stop-opacity="0"/>
    </radialGradient>
  </defs>
${inner}
</svg>
`;
}

function statsSvg(stats) {
  const rows = [
    ['Total stars', compact(stats.stars)],
    ['Total contributions', compact(stats.totalContributions)],
    ['Commits last year', compact(stats.commitsLastYear)],
    ['Pull requests', compact(stats.pullRequests)],
    ['Issues', compact(stats.issues)],
    ['Repos contributed to', compact(stats.contributedRepos)]
  ];
  const rowMarkup = rows.map(([label, value], index) => {
    const y = 56 + index * 20;
    return `  <text x="26" y="${y}" class="label">${esc(label)}</text>
  <text x="252" y="${y}" class="label" text-anchor="end">${esc(value)}</text>`;
  }).join('\n');

  return svgShell(430, 190, `  <text x="24" y="31" class="title">Vaibhav's GitHub Stats</text>
${rowMarkup}
  <circle cx="360" cy="106" r="40" stroke="#243247" stroke-width="8"/>
  <circle cx="360" cy="106" r="40" stroke="#F59E0B" stroke-width="8" stroke-linecap="round" stroke-dasharray="185 260" transform="rotate(-90 360 106)"/>
  <text x="360" y="103" class="num" text-anchor="middle">${esc(compact(stats.totalActivity))}</text>
  <text x="360" y="124" class="tiny" text-anchor="middle">last year</text>
  <circle cx="24" cy="168" r="4" fill="#38BDF8" opacity=".9"/>
  <circle cx="46" cy="168" r="4" fill="#FBBF24" opacity=".9"/>
  <circle cx="68" cy="168" r="4" fill="#F97316" opacity=".9"/>`);
}

function languageSvg(languages) {
  const total = languages.reduce((sum, lang) => sum + lang.size, 0) || 1;
  let x = 24;
  const bars = languages.slice(0, 5).map((lang) => {
    const width = Math.max(8, Math.round((lang.size / total) * 330));
    const markup = `<rect x="${x}" y="55" width="${width}" height="10" rx="5" fill="${lang.color || '#8B949E'}"/>`;
    x += width;
    return markup;
  }).join('\n  ');

  const items = languages.slice(0, 6).map((lang, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const lx = 28 + col * 180;
    const ly = 92 + row * 24;
    const pct = ((lang.size / total) * 100).toFixed(lang.size / total > 0.1 ? 1 : 2);
    return `  <circle cx="${lx}" cy="${ly - 4}" r="5" fill="${lang.color || '#8B949E'}"/>
  <text x="${lx + 14}" y="${ly}" class="muted">${esc(lang.name)} ${pct}%</text>`;
  }).join('\n');

  return svgShell(430, 190, `  <text x="24" y="31" class="title">Most Used Languages</text>
  ${bars}
${items}`);
}

function wrapText(value, maxLength = 54) {
  const words = String(value || 'Public software project').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

function repositorySvg(repo, displayName) {
  const description = wrapText(repo.description);
  const descriptionMarkup = description.map((line, index) => `  <text x="24" y="${66 + index * 18}" class="muted">${esc(line)}</text>`).join('\n');
  const language = repo.primaryLanguage?.name || 'Repository';
  const color = repo.primaryLanguage?.color || '#58A6FF';

  return svgShell(430, 145, `  <rect x="0" y="0" width="6" height="145" rx="3" fill="#F59E0B"/>
  <text x="24" y="34" class="title">${esc(displayName)}</text>
  <text x="406" y="33" class="tiny" text-anchor="end">OPEN REPOSITORY</text>
${descriptionMarkup}
  <circle cx="29" cy="119" r="5" fill="${esc(color)}"/>
  <text x="42" y="123" class="label">${esc(language)}</text>
  <text x="406" y="123" class="label" text-anchor="end">${esc(compact(repo.stargazerCount))} stars</text>`);
}
function mergeLanguages(repos) {
  const totals = new Map();
  for (const repo of repos) {
    if (repo.isFork) continue;
    for (const edge of repo.languages.edges) {
      const current = totals.get(edge.node.name) || { name: edge.node.name, color: edge.node.color, size: 0 };
      current.size += edge.size;
      if (!current.color) current.color = edge.node.color;
      totals.set(edge.node.name, current);
    }
  }
  return [...totals.values()].sort((a, b) => b.size - a.size);
}

function contributionTotal(collection) {
  return collection.contributionCalendar.totalContributions;
}

async function loadContributionHistory(createdAt) {
  const createdYear = new Date(createdAt).getUTCFullYear();
  const currentYear = now.getUTCFullYear();
  const daysByDate = new Map();
  let total = 0;

  for (let year = createdYear; year <= currentYear; year += 1) {
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    const start = year === createdYear && new Date(createdAt) > yearStart ? new Date(createdAt) : yearStart;
    const end = year === currentYear ? now : yearEnd;
    const data = await githubGraphQL(contributionQuery, {
      login,
      from: start.toISOString(),
      to: end.toISOString()
    });
    const calendar = data.user.contributionsCollection.contributionCalendar;
    total += calendar.totalContributions;

    for (const week of calendar.weeks) {
      for (const day of week.contributionDays) {
        const timestamp = Date.parse(`${day.date}T00:00:00Z`);
        if (timestamp >= start.getTime() && timestamp <= end.getTime()) {
          daysByDate.set(day.date, day.contributionCount);
        }
      }
    }
  }

  const days = [...daysByDate.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { total, days };
}

function calculateStreaks(days) {
  let longest = 0;
  let run = 0;
  for (const day of days) {
    run = day.count > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }

  const counts = new Map(days.map((day) => [day.date, day.count]));
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const key = () => cursor.toISOString().slice(0, 10);
  if ((counts.get(key()) || 0) === 0) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let current = 0;
  while ((counts.get(key()) || 0) > 0) {
    current += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return { current, longest };
}

function streakSvg(stats) {
  const columns = [
    { x: 105, value: compact(stats.totalContributions), label: 'Total contributions' },
    { x: 310, value: compact(stats.currentStreak), label: 'Current streak' },
    { x: 515, value: compact(stats.longestStreak), label: 'Longest streak' }
  ];
  const metrics = columns.map((item) => `  <text x="${item.x}" y="89" class="num" text-anchor="middle">${esc(item.value)}</text>
  <text x="${item.x}" y="119" class="label" text-anchor="middle">${esc(item.label)}</text>`).join('\n');

  return svgShell(620, 145, `  <text x="24" y="31" class="title">Contribution Streak</text>
  <line x1="207" y1="58" x2="207" y2="130" stroke="#304158"/>
  <line x1="413" y1="58" x2="413" y2="130" stroke="#304158"/>
${metrics}`);
}

function activitySvg(days) {
  const recent = days.slice(-42);
  const chart = { x: 54, y: 64, width: 752, height: 112 };
  const max = Math.max(1, ...recent.map((day) => day.count));
  const step = recent.length > 1 ? chart.width / (recent.length - 1) : chart.width;
  const points = recent.map((day, index) => ({
    x: chart.x + index * step,
    y: chart.y + chart.height - (day.count / max) * chart.height,
    ...day
  }));
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const area = `${line} L ${(chart.x + chart.width).toFixed(1)} ${(chart.y + chart.height).toFixed(1)} L ${chart.x} ${(chart.y + chart.height).toFixed(1)} Z`;
  const dots = points.filter((point) => point.count > 0).map((point) => `  <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3" fill="#FBBF24"/>`).join('\n');
  const total = recent.reduce((sum, day) => sum + day.count, 0);
  const firstDate = recent[0]?.date || '';
  const lastDate = recent.at(-1)?.date || '';

  return svgShell(860, 220, `  <text x="24" y="31" class="title">Contribution Flow</text>
  <text x="836" y="31" class="tiny" text-anchor="end">${esc(compact(total))} contributions / 42 days</text>
  <line x1="${chart.x}" y1="${chart.y + chart.height}" x2="${chart.x + chart.width}" y2="${chart.y + chart.height}" stroke="#304158"/>
  <line x1="${chart.x}" y1="${chart.y + chart.height / 2}" x2="${chart.x + chart.width}" y2="${chart.y + chart.height / 2}" stroke="#243247" stroke-dasharray="4 8"/>
  <path d="${area}" fill="#F97316" opacity=".12"/>
  <path d="${line}" stroke="#F59E0B" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
${dots}
  <text x="${chart.x}" y="202" class="muted">${esc(firstDate)}</text>
  <text x="${chart.x + chart.width}" y="202" class="muted" text-anchor="end">${esc(lastDate)}</text>`);
}
async function main() {
  const repos = [];
  let after = null;
  let user;

  do {
    const data = await githubGraphQL(graphQuery, {
      login,
      from: from.toISOString(),
      to: now.toISOString(),
      after
    });
    user = data.user;
    repos.push(...user.repositories.nodes);
    after = user.repositories.pageInfo.hasNextPage ? user.repositories.pageInfo.endCursor : null;
  } while (after);

  const contributions = user.contributionsCollection;
  const contributionHistory = await loadContributionHistory(user.createdAt);
  const streaks = calculateStreaks(contributionHistory.days);
  const contributedRepos = new Set([
    ...contributions.commitContributionsByRepository.map((item) => item.repository.name),
    ...contributions.pullRequestContributionsByRepository.map((item) => item.repository.name),
    ...contributions.issueContributionsByRepository.map((item) => item.repository.name)
  ]);

  const stats = {
    stars: repos.reduce((sum, repo) => sum + repo.stargazerCount, 0),
    totalContributions: contributionHistory.total,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    commitsLastYear: contributions.totalCommitContributions,
    pullRequests: user.pullRequests.totalCount,
    issues: user.issues.totalCount,
    contributedRepos: contributedRepos.size,
    totalActivity: contributionTotal(contributions)
  };

  const languages = mergeLanguages(repos);
  const featured = [
    { name: 'arc-identity-public', title: 'Arc Identity', file: 'featured-arc-identity.svg' },
    { name: 'vyom', title: 'Vyom', file: 'featured-vyom.svg' },
    { name: 'receipts-network', title: 'Receipts Network', file: 'featured-receipts-network.svg' }
  ].map((item) => ({ ...item, repo: repos.find((repo) => repo.name === item.name) }))
    .filter((item) => item.repo);
  await import('node:fs/promises').then(async (fs) => {
    await fs.mkdir('assets/generated', { recursive: true });
    await fs.writeFile('assets/generated/github-stats.svg', statsSvg(stats));
    await fs.writeFile('assets/generated/top-languages.svg', languageSvg(languages));
    await fs.writeFile('assets/generated/contribution-streak.svg', streakSvg(stats));
    await fs.writeFile('assets/generated/contribution-flow.svg', activitySvg(contributionHistory.days));
    for (const item of featured) {
      await fs.writeFile(`assets/generated/${item.file}`, repositorySvg(item.repo, item.title));
    }
  });

  console.log(`Generated profile stats for ${login}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});