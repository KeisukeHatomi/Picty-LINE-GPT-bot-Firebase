const functions = require('firebase-functions');
const { Configuration, OpenAIApi } = require('openai');
const line = require('@line/bot-sdk');
const { Client, LogLevel } = require("@notionhq/client");

const channelAccessToken = functions.config().line.talken;
const gptApiKey = new Configuration({ apiKey: functions.config().gpt.api });
const client = new line.Client({ channelAccessToken: channelAccessToken });
const gpt = new OpenAIApi(gptApiKey);
const notionApiKey = functions.config().notion.api;
const notionTableId = functions.config().notion.table;
const notion = new Client({
	auth: notionApiKey,
	logLevel: LogLevel.WARN,
});

const cache = {};
const cacheTTL = 1 * 60 * 1000; // 1分間


exports.helloWorld = functions.https.onRequest((request, response) => {

	if (request.method !== 'POST') {
		response.status(405).send(`Method not allowd`);
		return;
	}

	let answer = false;
	let inputType
	let inputText;
	let userId;
	let gptMessage;
	let cacheData;

	request.body.events.forEach((event) => {
		console.log(event)

		let text, emoji
		inputType = event.message.type;
		userId = event.source.userId;

		cacheData = getromCache(userId);
		console.log(cacheData)

		if (inputType === 'text') {
			inputText = event.message.text;

			// ❓⁉️🤔😃😊😅
			if (inputText.length > 3) {
				text = "そうだね～$";
				emoji = [{
					'index': text.length - 1,
					'productId': '5ac1bfd5040ab15980c9b435',
					'emojiId': '149',
				}];
				answer = true;
			} else {
				text = `ん❓なにかな❓$`;
				emoji = [{
					'index': text.length - 1,
					'productId': '5ac1bfd5040ab15980c9b435',
					'emojiId': '102',
				}];
			}

		} else {
			text = "ごめんね。写真とかステッカーって、わからないのよ$";
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

		client.pushMessage(userId, message)
			.then((res) => {
				console.log(`LINE: 送信完了 ${res}`);
			})
			.catch((e) => {
				console.log(`LINE: 送信失敗` + e);
				response.status(400).send(`Bad Request`);
			})

	});

	if (answer) {
		gptRequest(inputText, cacheData)
			.then((gptRes) => {
				console.log(`LINE: GPT応答成功`)
				gptMessage = gptRes.data.choices[0].message.content;
				text = `${gptMessage} $`;
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

				client.pushMessage(userId, message)
					.then((res) => console.log(`LINE: GPT応答送付完了 ${res}`))
					.catch((e) => {
						console.log(`LINE: 送信失敗` + e);
						response.status(400).send(`Bad Request`);
					});

				saveToCache(userId, gptMessage);

				updateNotionTable(inputText, gptMessage)
					.then((res) => {
						console.log(`Notion: ログ書き込み成功 ${res.url}` )
					})
					.catch((error) => {
						console.error("Notion: ログ書き込み失敗:", error)
						response.status(400).send(`Bad Request`);
					});

			})
			.catch((e) => {
				console.error("GPT: 応答失敗:" + e)
				response.status(400).send(`Bad Request`);
			}
			);
	}
	response.status(200).send("Picty-LINE-GPT-Bot webhook");
});

const gptRequest = async (mes, prevMes) => {
	const completion = await gpt.createChatCompletion({
		model: "gpt-3.5-turbo",
		messages: [
			{
				role: 'system',
				content: `
						あなたの名前はピクティ。私の親友で女性。
						質問には親友と話す口調で語尾に「よ」「ね」をつけて答える。
						日本語で120文字以内の範囲でできるだけ短くで答える。
						答えにurl参照してもよいが、リンク先が正しく、情報が閲覧できること。またurl情報は文字数に含まない。
						わからないときはうそをつかずに「ん～ちょっとわからないよ～」と言う。
						`
			},
			{
				role: "user",
				content: mes
			},
			// {
			// 	role: "assistant",
			// 	content: prevMes
			// },
		],
	});
	console.log(completion.data.choices[0].message)
	return completion;
};

async function updateNotionTable(question, answer) {
	const databaseId = notionTableId;
	const dateTime = getCurrentDate();

	const newPage = {
		parent: { database_id: databaseId },
		properties: {
			質問: {
				title: [
					{
						text: {
							content: question,
						},
					},
				],
			},
			GPT回答: {
				rich_text: [
					{
						text: {
							content: answer,
						},
					},
				],
			},
			日付: {
				date: {
					start: dateTime,
				},
			},
		},
	};

	const createdPage = notion.pages.create(newPage);
	return createdPage;
}

function getCurrentDate() {
	const today = new Date();
	const utcToday = new Date(today.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

	const year = utcToday.getFullYear();
	const month = String(utcToday.getMonth() + 1).padStart(2, '0');
	const day = String(utcToday.getDate()).padStart(2, '0');
	const hours = String(utcToday.getHours()).padStart(2, '0');
	const minutes = String(utcToday.getMinutes()).padStart(2, '0');
	const seconds = String(utcToday.getSeconds()).padStart(2, '0');

	return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

console.log(getCurrentDate());

// データをキャッシュに保存する関数
function saveToCache(key, data) {
	const cacheKey = key.toString();
	cache[cacheKey] = data;

	setTimeout(() => {
		delete cache[cacheKey];
	}, cacheTTL);
}

// キャッシュからデータを取得する関数
function getromCache(key) {
	let data = cache[key];
	if (data) {
		return data;
	}
	else {
		return "";
	}
}

