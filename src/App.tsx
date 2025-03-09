import "./App.css";
import { useRef, useEffect, useState } from 'react';
import { Amplify } from "aws-amplify";
import { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";
import { Wave } from 'react-animated-text';

import outputs from "../amplify_outputs.json";
import "@aws-amplify/ui-react/styles.css";

Amplify.configure(outputs);

const amplifyClient = generateClient<Schema>({
    authMode: "userPool",
});

const getTimestamp = () => {return new Date().toISOString().slice(0, 19)};

enum DialogType {
    InstructionInfo = "📜️ Instructions",
    SampleQuestionInfo = "❓Sample questions",
    Question = "Q",
    Answer = "A"
}

enum AnswerMode {
    Simple = "Simple",
    Verbose = "Verbose"
}

interface Dialog {
    time: string,
    type: DialogType,
    mode: AnswerMode
    text: string,
}

function App() {
    const instruction: Dialog = {time: "", type: DialogType.InstructionInfo, mode: AnswerMode.Simple, text: `
        🤖 I'm an Amazon Bedrock Agent designed to help troubleshoot payments-related issues. For now I'm only supported in Beta and each user is limited to 4 questions per minute.
        ⏳ Response time varies depending on the number of actions the agent needs to take to find an answer. Most answers take 5-20 seconds.
        🛠 If you are a developer and need to troubleshoot issues, Verbose mode can provide more (sometimes too much) details. Otherwise use Simple mode.
        📩 If you think my response is inaccurate, please let the team know by prepending your message with a #feedback hashtag (e.g., \"#feedback Transaction XYZ was reported to OFA but the agent said otherwise\"). For general comments and questions, allowlist requests, feature requests, bug reports, etc., please reach out to us directly on Slack (hhn@, dhuphims@).`}
    const sampleQuestion: Dialog = {time: "", type: DialogType.SampleQuestionInfo, mode: AnswerMode.Simple, text: `
        💬 What is the reporting status of transaction 33241774?
        💬 Invoice 1112085784 is still open in OFA, do you know why?
        💬 Is transaction 33159494 reported to OFA?
        💬 Is invoice CO-171458165796599 closed in OFA? (Follow up: What should I do?)`};
    const [dialogs, setDialogs] = useState<Dialog[]>([instruction, sampleQuestion]);
    const [input, setInput] = useState("");
    const [isWaiting, setIsWaiting] = useState(false);
    const scrollableDivRef = useRef<null | HTMLDivElement>(null);
    const [answerMode, setAnswerMode] = useState<AnswerMode>(AnswerMode.Simple);

    async function withTimeout<T>(promise: Promise<T>, timeoutInMillis: number): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                setTimeout(() => {
                    reject(new Error('Timeout'));
                }, timeoutInMillis);
            }),
        ]);
    }

    // Function to fetch from our backend and update dialog array
    async function askAgent(e: any) {
        const input = e.input.trim();
        if (input == "") {
            return;
        }

        setIsWaiting(true);

        const question: Dialog = {time: getTimestamp(), type: DialogType.Question, mode: answerMode, text: input};
        let newDialogs = [...dialogs];
        newDialogs.push(question);
        setDialogs(newDialogs);

        let answer: Dialog = {time: "", type: DialogType.Answer, mode: question.mode, text: ""};

        try {
            const request = {question: question.text, sessionId: "12345", mode: question.mode.toUpperCase()};
            const response = await withTimeout(amplifyClient.queries.askAgent(request), 60000);

            answer = {
                time: getTimestamp(), type: DialogType.Answer, mode: question.mode, text: response.data == null ? "Null response" : response.data,
            };
        } catch (err: any) {
            answer = {
                time: getTimestamp(), type: DialogType.Answer, mode: question.mode, text: err.message
            };
        }
        finally {
            let newerDialogs = [...newDialogs];
            newerDialogs.push(answer);
            setDialogs(newerDialogs);
            setIsWaiting(false);
        }
    }

    useEffect(() => { // automatically scroll to bottom when display text is updated
        if (scrollableDivRef.current != null) {
            scrollableDivRef.current.scrollTo({
                top: scrollableDivRef.current.scrollHeight,
                behavior: 'smooth',
            });
        }
    }, [dialogs]);


    const handleKeyDown = (event: any) => { // bind Enter key to askAgent method
        if (event.key === 'Enter') {
            askAgent({input});
        }
    };

    const updateAnswerMode = (event: any) => {
        setAnswerMode(event.target.value);
    };

    return (
        <div className="App" style={{ height: '90vh', fontFamily:"San Francisco Pro"}}>
            <div style={{marginTop: '-2%', textAlign: "center"}}>
                <span style={{color: 'black', marginRight: '5%'}}><b>🐦‍🔥 Agent Phoenix</b><sup style={{color: 'black'}}>✨beta</sup></span>
                <span style={{color: 'black'}}>Mode: </span>
                <select disabled={isWaiting} value={answerMode} onChange={updateAnswerMode}>
                    <option value={AnswerMode.Simple}>Simple</option>
                    <option value={AnswerMode.Verbose}>Verbose</option>
                </select>
            </div>

            <div style={{borderRadius: '4px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '80%', marginLeft: '20%', marginRight: '20%', marginTop: '1%', border: 'solid gray'}}>
                <div ref={scrollableDivRef} style={{overflowY: 'auto'}}>
                    {
                        dialogs.map((dialog, index) => {
                            if (dialog.type != DialogType.Question && dialog.type != DialogType.Answer) {
                                return (
                                    <div key={index} style={{
                                        borderRadius: '4px',
                                        backgroundColor: '#f5f5f5',
                                        color: 'black',
                                        marginLeft: '1%',
                                        marginRight: '1%',
                                        marginBottom: '1%',
                                        whiteSpace: "pre-wrap"
                                    }}>
                                        &nbsp;<b>{dialog.type}:</b> {dialog.text}
                                    </div>
                                )
                            }
                            else {
                                return (
                                    <div key={index} style={{
                                        borderRadius: '4px',
                                        backgroundColor: dialog.type == DialogType.Question ? '#e9e9f5' : (dialog.mode == AnswerMode.Simple ? '#e9f5e9' : '#f5e9e9'),
                                        color: 'black',
                                        marginLeft: '1%',
                                        marginRight: '1%',
                                        marginBottom: '1%'
                                    }}>
                                        <span style={{color: "gray"}}>&nbsp;[{dialog.time}UTC] </span>
                                        <b>{dialog.type}{dialog.type == DialogType.Question ? "" : ` (${dialog.mode})`}:</b> {dialog.text}
                                    </div>
                                )
                            }
                        })
                    }
                </div>
            </div>
            <br/>

            <div style={{marginLeft: '20%', marginRight: '20%', fontFamily:"San Francisco Pro"}}>
                <input style={{width: '88%', marginRight: '2%', marginBottom: '2%', fontFamily:"San Francisco Pro", fontSize: '15px'}}  placeholder="Ask and it will be given to you" type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}/>
                <button style={{width: '10%', marginBottom: '2%', fontFamily:"San Francisco Pro", fontSize: '15px'}} disabled={isWaiting} onClick={() => askAgent({input})}>Ask</button>
            </div>

            {isWaiting ? <span style={{color:"red", textAlign: "center"}}><Wave text="waiting for response..." effect="stretch" effectChange={1.8} effectDuration={0.6}/></span> : null}
        </div>
    )
}

export default App;