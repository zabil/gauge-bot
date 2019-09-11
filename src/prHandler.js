const labels = require('./labels');
const comments = require('./comments');
const messages = require('./messages');
const data = require('./data')

async function createStatus(context, state, recheck) {
  if (state) {
    if (recheck) await comments.addComment(context, messages.claVerified());
    let number = context.payload.pull_request.number;;
    await labels.add(context, number, 'cla-signed', '1CA50F');
  }
  let status = context.repo({
    state: state ? 'success' : 'failure',
    context: 'verification/cla-signed',
    targetURl: '',
    sha: context.payload.pull_request.head.sha
  })
  return context.github.repos.createStatus(status);
}

async function updatePR(context, unsignedUsers, recheck) {
  if (unsignedUsers.length === 0 || (unsignedUsers.length === 1 && unsignedUsers[0].includes('[bot]'))) {
    return createStatus(context, true, recheck);
  }
  let users = [];
  unsignedUsers.forEach(u => {
    let user = `@${u}`;
    if (!users.includes(user))
      users.push(user);
  });
  await comments.addComment(context, messages.claNotice(users.join(', ')));
  return createStatus(context, false);
}

async function prCreated(context, recheck) {
  const compare = await context.github.repos.compareCommits(context.repo({
    base: context.payload.pull_request.base.sha,
    head: context.payload.pull_request.head.sha
  }));
  let unsignedUsers = [];
  for (const { author, committer } of compare.data.commits) {
    if (!author || !committer) continue;
    let authorLogin = author.login;
    let committerLogin = committer.login;
    if (authorLogin !== committerLogin && committerLogin !== 'web-flow') {
      let signed = await data.hasSignedCLA(committerLogin);
      !signed && unsignedUsers.push(committerLogin);
    }
    let signed = await data.hasSignedCLA(authorLogin);
    !signed && unsignedUsers.push(authorLogin);
  }
  return updatePR(context, unsignedUsers, recheck);
}

module.exports = prCreated;
