const functions = require('firebase-functions');
const { Configuration, OpenAIApi } = require('openai');
const https = require('https');
const line = require('@line/bot-sdk');

const channelAccessToken = functions.config().line.talken;
const gptApiKey = functions.config().gpt.api;
const config = new Configuration({
    apiKey: gptApiKey
});
const gpt = new OpenAIApi(config);

const client = new line.Client({
    channelAccessToken: channelAccessToken
});

exports.helloWorld = functions.https.onRequest((request, response) => {
    if (request.method == 'POST') {

        let answer = false;
        let inputType
        let inputText;
        let replyToken;

        request.body['events'].forEach(event => {
            console.log(event)

            let text, emoji
            inputType = event['message']['type'];
            replyToken = event['source']['userId'];

            if (inputType === 'text') {
                text = "そうだね～$";
                emoji = [{
                    'index': text.length - 1,
                    'productId': '5ac1bfd5040ab15980c9b435',
                    'emojiId': '149',
                }];

                inputText = event['message']['text'];
                answer = true;

            } else {
                text = "ごめんね。写真とかステッカーって、わからないんだ$";
                emoji = [{
                    'index': text.length - 1,
                    'productId': '5ac1bfd5040ab15980c9b435',
                    'emojiId': '121',
                }];
            }

            const message = {
                type: 'text',
                text: text,
                emojis: emoji,
            }

            client.pushMessage(replyToken, message)
                .then(() => { })
                .catch((e) => {
                    console.log(e);
                })

        });

        if (answer) {
            gptRequest(inputText).then((gptRes) => {
                const gptMes = gptRes.data.choices[0].message.content;
                text = `${gptMes} $`;
                emoji = [{
                    'index': text.length - 1,
                    'productId': '5ac1bfd5040ab15980c9b435',
                    'emojiId': '105',
                }];

                const message = {
                    type: 'text',
                    text: text,
                    emojis: emoji,
                }

                client.pushMessage(replyToken, message)
                    .then(() => { })
                    .catch((e) => {
                        console.log(e);
                    })
            });
        } 
        
        response.send("Picty-LINE-GPT-Bot webhook");
    }
});

const gptRequest = async (mes) => {
    const completion = await gpt.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: mes }],
    });
    console.log(completion.data.choices[0].message)
    return completion;
};


// exports.helloWorld = functions.https.onRequest((request, response) => {
//     functions.logger.info("Hello logs!", { structuredData: true });
//     response.send("Hello from Firebase!");
// });
