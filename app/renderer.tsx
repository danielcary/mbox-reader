import * as React from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';

import { myapi as APITYPE } from '../src/preload'
import { Button } from 'react-bootstrap';

declare const myapi : APITYPE;

// theorotically, we should be to set the titile window.electronAPI.setTitle()


class App extends React.Component<any, any> {

    constructor(props: any) {
        super(props);
        
        myapi.setTitle("s");

        myapi.onLoadFileCompleted((success) => {

        });
    }

    async openFile() {
        const val = await myapi.openFile();

        if (val && val[0]) {
            console.log(val);
            myapi.loadFile(val[0]);
        }
    }

    render() {
        return <div>
            <h2>Hello World</h2>
            <Button onClick={() => this.openFile()}>Open</Button>
        </div>
    }

};

(document.getElementsByTagName("body")[0] as Element).innerHTML = "<div id='react-app'></div>";
createRoot(document.getElementById('react-app') as Element).render(<React.StrictMode><App /></React.StrictMode>);
