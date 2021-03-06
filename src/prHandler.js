const labels = require('./labels');
const comments = require('./comments');
const messages = require('./messages');
const { isBotUser } = require('./util');
const axios = require('axios').default;
const { Random, MersenneTwister19937 } = require('random-js');

const random = new Random(MersenneTwister19937.autoSeed());
const { createProjectCard, PR_CONTENT_TYPE, GAUGE_READY_FOR_DEV_COLUMN_NAME } = require('./projects');

async function prUpdated(context, recheck) {
  let users = await getCommitUsers(context);
  if (context.payload.action === 'opened') {
    await createPRReviewRequest(context, users);
    await createProjectCard(context, context.payload.pull_request.id, PR_CONTENT_TYPE, GAUGE_READY_FOR_DEV_COLUMN_NAME);
  }
}


async function createPRReviewRequest(context, users) {
  if (isBotUser(context.payload.pull_request.user.login)) return;
  const ownerLogin = context.payload.organization.login;
  const repoName = context.payload.repository.name;
  let reviewTeam = (await context.github.teams.list({ org: "getgauge" }))
    .data.find(team => team.name === "Reviewers");
  if (!reviewTeam) {
    context.log("Cannot find team with name 'Reviewers'");
    return;
  }
  let members = (await context.github.teams.listMembers({ team_id: reviewTeam.id })).data;
  let mem = members.filter(member => !users.includes(member.login));
  let reviewer = random.pick(mem).login;
  await context.github.pullRequests.createReviewRequest({
    owner: ownerLogin,
    repo: repoName,
    number: context.payload.pull_request.number,
    reviewers: [reviewer]
  });
}

async function getCommitUsers(context) {
  const compare = await context.github.repos.compareCommits(context.repo({
    base: context.payload.pull_request.base.sha,
    head: context.payload.pull_request.head.sha
  }));
  let users = [];
  for (const { author, committer } of compare.data.commits) {
    if (!author || !committer) continue;
    let authorLogin = author.login;
    let committerLogin = committer.login;
    if (authorLogin !== committerLogin && committerLogin !== 'web-flow') {
      if (!users.includes(committerLogin)) users.push(committerLogin);
    }
    if (!users.includes(authorLogin)) users.push(authorLogin);
  }
  return users;
}

async function prClosed(context) {
  let labels = context.payload.pull_request.labels;
  let merged = context.payload.pull_request.merged;
  let owner = context.payload.pull_request.base.repo.owner.login;
  let repo = context.payload.pull_request.base.repo.name;

  if (merged && labels.some(e => e.name == 'ReleaseCandidate')) {
    try {
      let response = await axios.post('https://api.github.com/repos/' + owner + '/' + repo + '/deployments', {
        "ref": "master",
        "required_contexts": [],
        "environment": "production"
      }, {
        headers: {
          'Authorization': 'token ' + process.env.GAUGEBOT_GITHUB_TOKEN,
          'Accept': 'application/vnd.github.ant-man-preview+json',
          'Content-Type': 'application/json',
        },
      })
      console.log(response);
    } catch (error) {
      console.error(error);
    }
  }
}


async function prLabeled(context) {
  let label = context.payload.label;
  let creator = context.payload.pull_request.user.login;
  let owner = context.payload.pull_request.base.repo.owner.login;
  let repo = context.payload.pull_request.base.repo.name;
  let number = context.payload.pull_request.number;
  if (label.name === 'ReleaseCandidate') {
    let message = messages.bumpVersion(creator, owner, repo);
    await comments.addComment(context, message, owner, repo, number);
  }
}

module.exports = {
  prUpdated,
  prClosed,
  prLabeled
};
