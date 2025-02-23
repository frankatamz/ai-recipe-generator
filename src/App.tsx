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

function App() {
    const [input, setInput] = useState("");
    const [dialogs, setDialogs] = useState([]);
    const [isWaiting, setIsWaiting] = useState(false);
    const scrollableDivRef = useRef(null);
    const getTimestamp = () => {return new Date().toISOString().slice(0, 19)};

    // Function to fetch from our backend and update dialog array
    async function askAgent(e) {
        setIsWaiting(true);

        const question = {
            time: getTimestamp(),
            type: "Q",
            text: e.input
        }
        let newDialogs = [...dialogs];
        newDialogs.push(question);
        setDialogs(newDialogs);

        let answer;

        try {
            const response = await amplifyClient.queries.sayHello({
                name: question.text
            });

            answer = {
                time: getTimestamp(),
                type: "A",
                text: response.data,
            };

        } catch (err) {
            answer = {
                time: getTimestamp(),
                type: "A",
                text: err
            };
        }
        finally {
            let newerDialogs = [...newDialogs];
            newerDialogs.push(answer);
            setDialogs(newerDialogs);
            setIsWaiting(false);
        }
    }

    const handleKeyDown = (event) => { // bind to Enter key
        if (event.key === 'Enter') {
            askAgent({input});
        }
    };

    useEffect(() => { // automatically scroll to bottom when display text is updated
        scrollableDivRef.current.scrollTo({
            top: scrollableDivRef.current.scrollHeight,
            behavior: 'smooth',
        });
    }, [dialogs]);

    return (
        <div className="App" style={{ height: '90vh', fontFamily:"San Francisco Pro"}}>
            <h3  style={{color: 'red', marginTop: '-2%', textAlign: "center"}}>@agent_phoenix <span >🐦‍🔥</span></h3>

            <div style={{borderRadius: '4px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '80%', marginLeft: '20%', marginRight: '20%', marginTop: '1%', border: 'solid gray'}}>
                <div ref={scrollableDivRef} style={{overflowY: 'auto'}}>
                    {
                        dialogs.map((dialog, index) => {
                            return (
                                <div key={index} align="left" style={{backgroundColor: dialog.type == "Q" ? '#f5f5f5' : '#f5e9e9', color: 'black', marginLeft: '1%', marginRight: '1%', marginBottom: '1%'}}>
                                    <span style={{color: "gray"}}>[{dialog.time}]</span> <b>{dialog.type}:</b> {dialog.text}
                                </div>
                            )
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