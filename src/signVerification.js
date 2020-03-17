const crypto = require("crypto");

const slackVerification = process.env.SLACK_VERIFICATION != "false";
const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
const requestMaxAge = process.env.SLACK_REQUEST_MAX_AGE;


function verificationResult(success, message) {
  return {
    success,
    message
  }
}

if (slackVerification && !slackSigningSecret) {
  throw Error("Missing Slack Signing Secret")
}


let signVerification = (headers, requestBody) => {
  if (!slackVerification) {
    return verificationResult(true, "Passthrough")
  }
  if (!slackSigningSecret) {
    return verificationResult(true, "Slack Signing Key not Provided")
  }
  let slackSignature = headers['x-slack-signature'];
  if (!slackSignature) {
    return verificationResult(false, "Missing signature header")
  }
  let timestamp = headers['x-slack-request-timestamp'];
  if (!timestamp) {
    return verificationResult(false, "Missing request-timestamp header")
  }
  if (requestMaxAge) {
    let maxAge = parseInt(requestMaxAge)
    if (!isNaN(maxAge) && maxAge > 0) {
      let time = Math.floor(new Date().getTime() / 1000);
      if (Math.abs(time - timestamp) > requestMaxAge) {
        return verificationResult(false, "Request age exceeded")
      }
    }
  }
  let sigBasestring = 'v0:' + timestamp + ':' + requestBody;
  let mySignature = 'v0=' +
    crypto.createHmac('sha256', slackSigningSecret)
    .update(sigBasestring, 'utf8')
    .digest('hex');
  if (crypto.timingSafeEqual(
      Buffer.from(mySignature, 'utf8'),
      Buffer.from(slackSignature, 'utf8'))) {
    return verificationResult(true, "Success");
  } else {
    return verificationResult(false, "Verifiation failed");
  }
}
module.exports = signVerification;
