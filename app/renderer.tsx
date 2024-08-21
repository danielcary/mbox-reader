import * as React from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';

// theorotically, we should be to set the titile window.electronAPI.setTitle()


class App extends React.Component<any, any> {

    constructor(props: any) {
        super(props);

        myapi.setTitle("s");
    }

    render() {
        return <div>
            <h2>Hello World</h2>
        </div>
    }

};

(document.getElementsByTagName("body")[0] as Element).innerHTML = "<div id='react-app'></div>";
createRoot(document.getElementById('react-app') as Element).render(<React.StrictMode><App /></React.StrictMode>);
