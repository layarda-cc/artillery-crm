import io from 'socket.io-client';

const url = process.env.URL || "http://127.0.0.1:8041"; // tweak this as your environment
const MAX_CLIENTS = 200; // tweak this to max client
// const MIN_CLIENTS = 5; // tweak this to min client
let RAMP_TIME_SECONDS = 60; // tweak this to how long to ramp it?
// const POLLING_PERCENTAGE = 0.05;
const CLIENT_CREATION_INTERVAL_IN_MS = 10;
const EMIT_INTERVAL_IN_MS = 1000;


let clientCount = 0;
let clientConnectedCount = 0;
let clientDisconnectedCount = 0;
let lastReport = new Date().getTime();
let totalMessageSent = 0;
let totalRepliedMessage = 0;
let totalNewConv = 0;
let totalNewConvReplied = 0;

let requestNewConversationCounter = 0;
let messageCounter = 0;
let respNewConversationCounter = 0;
let respMessageCounter = 0;

let firstMessagecount = 1;
let secondMessagecount = 1;
let isStart = false;


let lastEmitTime: Map<string, Date> = new Map();

const artillery = async () => {
    // const transports =
    //     Math.random() < POLLING_PERCENTAGE ? ["polling"] : ["polling", "websocket"];
    const transports = ["websocket"];
    const firstMessage = `1st msg ${firstMessagecount}`;

    const socket = io(url, {
        transports: transports,
        auth: {
            type: "CLIENT",
            id: "7f1dfb58-b5cc-453d-a7a6-8fa34a0093ed"
        },
    }).on('connect', () => {
        clientConnectedCount++;
        if (socket.id !== undefined) {
            lastEmitTime.set(socket.id, new Date())
        }
        isStart = true;
    });

    clientCount++;

    setTimeout(() => {
        socket.emit("requestNewConversation", { "text": firstMessage });
        requestNewConversationCounter++;
    }, 1000)

    const socketDisconnector = () => {
        const now = new Date()
        const key = socket.id ?? ''
        const lastTime = lastEmitTime.get(key)

        const durationInactivitySecond = 5
        let elapseSecond = 0
        if (lastTime !== undefined) {
            elapseSecond = (now.getTime() - lastTime.getTime()) / 1000
        }

        if (elapseSecond >= durationInactivitySecond) {
            socket.disconnect()
            lastEmitTime.delete(key)
            return
        }

        setTimeout(socketDisconnector, 1000)
    }

    socketDisconnector()

    socket.on("newConversation", (convID: string) => {
        respNewConversationCounter++;

        const emitMessage = (conversationID: string, startTime: Date) => {
            return () => {
                const secondMessage = `2nd msg - ${conversationID} - ${secondMessagecount++}`;
                const now = new Date()
                const elapsedSecond: number = Math.ceil((Math.ceil(now.getTime() - startTime.getTime())) / 1000);

                socket.emit("message", { "text": secondMessage });
                messageCounter++;
                if (socket.id !== undefined) {
                    lastEmitTime.set(socket.id, new Date())
                }

                socket.on("message", (data) => {
                    const msg = data.text;
                    if (msg === secondMessage) {
                        respMessageCounter++;
                    }

                    if (socket.id !== undefined) {
                        lastEmitTime.set(socket.id, new Date())
                    }
                });

                if (elapsedSecond < RAMP_TIME_SECONDS || RAMP_TIME_SECONDS === -1) {
                    setTimeout(emitMessage(conversationID, startTime), EMIT_INTERVAL_IN_MS);
                }
            }
        }

        // begin artillery here
        emitMessage(convID, new Date())()
    })

    socket.on("connect_error", (err: any) => {
        console.log(err);
        console.log("something happen on connecting")
        // the reason of the error, for example "xhr poll error"
        console.log(err.message);

        // some additional description, for example the status code of the initial HTTP response
        console.log(err.description);

        // some additional context, for example the XMLHttpRequest object
        console.log(err.context);
    })

    socket.on("disconnect", (reason, description) => {
        if (reason !== 'io client disconnect') {
            console.log(`disconnect due to ${reason} - ${description}`);
        }

        clientDisconnectedCount++;
    });

    firstMessagecount++;

    if (clientCount < MAX_CLIENTS) {
        setTimeout(artillery, CLIENT_CREATION_INTERVAL_IN_MS);
    }
}

const printReport = () => {
    const now = new Date();
    const durationSinceLastReport = (now.getTime() - lastReport) / 1000;
    const newConvPerSeconds = (
        requestNewConversationCounter / durationSinceLastReport
    ).toFixed(2);

    const msgPacketsPerSeconds = (
        messageCounter / durationSinceLastReport
    ).toFixed(2);

    const msgRepliedPerSeconds = (
        respMessageCounter / durationSinceLastReport
    ).toFixed(2);

    const newConvRepliadPerSeconds = (
        respNewConversationCounter / durationSinceLastReport
    ).toFixed(2);

    totalRepliedMessage += respMessageCounter
    totalMessageSent += messageCounter
    totalNewConv += requestNewConversationCounter
    totalNewConvReplied += respNewConversationCounter


    console.log(
        `========\n`,
        `client count: ${clientCount};\n`,
        `client connected: ${clientConnectedCount};\n`,
        `client disconnected: ${clientDisconnectedCount};\n`,
        `average packets new conversation RPS: ${newConvPerSeconds}; average packets send message RPS: ${msgPacketsPerSeconds}`,
        '\n',
        `average packets server response new conversation RPS: ${newConvRepliadPerSeconds}; average packets server response send message RPS: ${msgRepliedPerSeconds}`,
        "\n",
        "total new conv sent: ", totalNewConv, "\n",
        "total new conv replied:", totalNewConvReplied, "\n",
        "total message sent: ", totalMessageSent, "\n",
        "total message replied:", totalRepliedMessage, "\n",
        `=======\n\n`
    );


    requestNewConversationCounter = 0;
    messageCounter = 0;
    respNewConversationCounter = 0;
    respMessageCounter = 0;
    lastReport = now.getTime();
};

artillery();

const reportJob = setInterval(printReport, 1000);

const stopper = () => {
    if (lastEmitTime.size === 0 && isStart === true) {
        console.log("stop the artillery in 5 second")
        setTimeout(() => {
            clearInterval(reportJob)
            process.exit(0);
        })
    }

    setTimeout(stopper, 1000)
}

stopper()


