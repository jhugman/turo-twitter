'use strict';

var keywords = ['@turoio','#turo','#turoio', 'calculate', 'calculate:'],
    myTwitterHandle = 'turoio';

var _ = require('underscore');

var Twit = require('twit'),
    credentials = require('./__private_twitter_credentials'),
    T = new Twit(credentials);

var $turo = require('turo'),
    turo = new $turo.Turo();

turo.include('app');
if (turo.markRootScope) {
  turo.markRootScope();
}

var stream = T.stream('statuses/filter', { track: keywords });

stream.on('tweet', function (tweet) {
  var hashtags = _.pluck(tweet.entities.hashtags || [], 'text'),
      mentioned = _.pluck(tweet.entities.user_mentions || [], 'screen_name');

  mentioned.push(myTwitterHandle);

  var text = tweet.text,
      user = tweet.user,
      username = user.screen_name;
  
  if (username === myTwitterHandle) {
    return;
  }

  var reply = createReply(text, hashtags, mentioned, username);

  if (!reply) {
    return;
  }

  T.post('statuses/update', { status: reply, in_reply_to_status_id: tweet.id_str }, function(err, data, response) {
    console.log('-------------------------');
    console.log(username + ': ' + tweet.text);
    console.log('replied: ' + reply);    
  });

});

function createReply (text, hashtags, mentioned, user) {
  var expressionText = findExpression(text);
  
  if (!expressionText) {
    return;
  }

  var cleanText = scrubEntities(expressionText, '#', hashtags);
  cleanText = scrubEntities(cleanText, '@', mentioned);
  
  var expressions = cleanText.split(/\s*[,;\n]+\s*/g);
  var results = calculateExpressions(expressions);

  var atReplyUsers = _(mentioned)
    .reject(function (screenName) {
      return screenName === user || screenName == myTwitterHandle;
    });

  atReplyUsers.unshift(user);

  var args = {
    users: _(atReplyUsers).map(function (u) { return '@' + u; }).join(' '),
    results: results.join(', '),
    hashtags: _(hashtags).map(function (u) { return '#' + u; }).join(' ')
  };

  var reply = args.users + ' ' + args.results;

  if (hashtags.length) {
    reply += ' ' + args.hashtags
  }

  if (_.isEmpty(results)) {
    return;
  }

  return reply;
  
}

function findExpression (text) {
  var lcText = text.toLowerCase(),
      startExpressionIndex = 
        _.chain(keywords).map(function (term) {
          var index = lcText.indexOf(term);
          if (index >= 0) {
            return index + term.length + 1;
          }
          return -1;
        })
        .max()
        .value();
  if (startExpressionIndex < 0) {
    return;
  }

  text = text.substring(startExpressionIndex);
  return scrubSuffixes(text, ['/cc', '/via', '/by']);
}

function calculateExpressions (expressions) {
  var results = _.chain(expressions)
    .map(function (expr) {
      var r = turo.evaluate(expr);
      if (r.parseError) {
        return;
      }

      if (r.expressionErrors()) {
        console.log(r.expressionErrors());
        return r.expressionErrors()[0].error;
      }

      var resultString = '';
      if (r.identifier()) {
        resultString = r.identifier() + ' = ';
      }

      resultString += r.valueToString();

      return resultString;
    })
    .compact()
    .value();
  return results;
}

function scrubEntities(text, prefix, list) {
  if (_.isEmpty(list)) {
    return text;
  }
  var reText = prefix + list.join('|' + prefix),
      re = new RegExp(reText, 'g');

  return text.replace(re, '');
}

function scrubSuffixes(text, suffixes) {
  _.each(suffixes, function (suffix) {
    var index = text.indexOf(suffix + ' ');
    if (index >= 0) {
      text = text.substring(0, index);
    }
  });
  return text;
}


// createReply('zomg @turoio 1 + 2; 3 * 2 #testing', ['testing'], ['turoio'], 'jhugman');
// createReply('zomg @turoio 1 + 2; 3 * 2; #testing /cc @juliandoesstuff', ['testing'], ['turoio', 'juliandoesstuff'], 'jhugman');
// createReply('zomg @turoio 1 + 2; 3 * 2 @juliandoesstuff', ['testing'], ['turoio', 'juliandoesstuff'], 'jhugman');
// createReply('zomg @turoio 1 + 2; 3 * 2 /cc @juliandoesstuff', ['testing'], ['turoio', 'juliandoesstuff'], 'jhugman');

