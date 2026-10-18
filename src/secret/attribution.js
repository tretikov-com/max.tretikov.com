export function attributedCommitMessage(message, { username, author }) {
  return `${String(message).trim()}\n\nSubmitted by ${author.name} <${author.email}> (${username}).`;
}
