import { Component } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

import * as mbox from './mbox';
import JSZip from 'jszip';

interface IAppState {

}


type emailFile = {
  email: string,
  name: string,
};

class App extends Component<any, IAppState> {

  constructor(props: any) {
    super(props);


  }

  async process() {
    const f = document.getElementById('mboxFile')! as HTMLInputElement;
    console.log(f.files)

    // if (await mbox.looksLikeMbox(f.files![0]) == false) {
    //   out.textContent = "This file does not look like an mbox!!!";
    //   console.error("This file does not look like an mbox!!!");
    //   return;
    // }

    let emails: emailFile[] = [];
    let emailsSize = 0;
    await mbox.readMboxFile(f.files![0], async (m) => {
      const email = mbox.buildEml(m);
      emails.push({ email: email, name: this.safeFilename(m.subject, m.index) });
      emailsSize += new TextEncoder().encode(email).byteLength;
      if (emailsSize > 200 * 1024 ** 2) {
        const batch = emails;
        emails = [];
        emailsSize = 0;

        await this.genZip(batch);
      }
    });

    if (emails.length > 0) {
      await this.genZip(emails);
    }

  }

  /**
 * Turn an email subject (or any string) into a safe filename.
 * 
 * - Replaces illegal characters \/:*?"<>| with "_"
 * - Trims trailing dots and spaces (Windows forbids these)
 * - Ensures length <= 120 characters (adjustable)
 * - Falls back to "message" if string is empty
 */
  private safeFilename(subject: string | undefined, index: number, maxLen = 120): string {
    const fallback = "message";
    const base = (subject ?? fallback).trim() || fallback;

    // Replace disallowed characters
    let name = base.replace(/[\\\/:*?"<>|]/g, "_");

    // Trim trailing spaces/dots
    name = name.replace(/[ .]+$/, "");

    // Enforce length limit (reserve space for index + extension)
    const reserve = 10; // e.g. "_1234.eml"
    if (name.length > maxLen - reserve) {
      name = name.slice(0, maxLen - reserve);
    }

    return `${name}_${index}.eml`;
  }


  private async genZip(emails: emailFile[]) {
    const zip = new JSZip();
    emails.forEach((email) => {
      zip.file(email.name, email.email);
    });

    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 4 }
    });

    // Trigger download
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = 'mbox.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
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
