import { useState, Component } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

import { looksLikeMbox, parseMbox, readMboxFile } from './mbox';

interface IAppState {

}

class App extends Component<any, IAppState> {

  constructor(props: any) {
    super(props);


  }

  async process() {
    const f = document.getElementById('mboxFile')! as HTMLInputElement;
    const out = document.getElementById('out')! as HTMLElement;
    console.log(f.files)

    const text = await readMboxFile(f.files![0]);

    if (!looksLikeMbox(text)) {
      out.textContent = 'This file does not look like an mbox (missing "From " separator at start).';
      return;
    }

    const msgs = parseMbox(text);
    out.textContent =
      `Parsed ${msgs.length} messages.\n\n` +
      // Show a quick summary of the first few messages:
      msgs.slice(0, 5).map(m =>
        [
          `#${m.index}`,
          `Subject: ${m.subject ?? '(no subject)'}`,
          `From: ${m.from ?? m.envelopeFrom ?? '(unknown)'}`,
          `To: ${m.to ?? '(unknown)'}`,
          `Date: ${m.date?.toISOString?.() ?? m.envelopeDate?.toISOString?.() ?? '(unknown)'}`,
          `--- body preview ---`,
          (m.body || '').slice(0, 300).replace(/\n/g, '\\n'),
          `---------------------`
        ].join('\n')
      ).join('\n\n');

  }

  render() {
    return (
      <>
        <div>
          <a href="https://vite.dev" target="_blank">
            <img src={viteLogo} className="logo" alt="Vite logo" />
          </a>
          <a href="https://react.dev" target="_blank">
            <img src={reactLogo} className="logo react" alt="React logo" />
          </a>
        </div>
        <h1>Vite + React</h1>
        <div className="card">
          <p>
            Edit <code>src/App.tsx</code> and save to test HMR
          </p>
        </div>
        <p className="read-the-docs">
          Click on the Vite and React logos to learn more
        </p>
        <div className="card">
          <input type="file" id="mboxFile" accept=".mbox,.txt" />
          <button onClick={() => this.process()}>
            Process
          </button>
        </div>
        <pre id="out"></pre>
      </>
    );
  }

}

export default App
