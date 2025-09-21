import { Component } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Container from 'react-bootstrap/Container';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import Spinner from 'react-bootstrap/Spinner';
import JSZip from 'jszip';
import 'bootstrap/dist/css/bootstrap.min.css';

import * as mbox from './mbox';

const compressSizeLimit = 200 * 1024 ** 2;

interface IAppState {
  processing: boolean | 'done',
  alert: null | string,
  fileLoaded: boolean,
};

type emailFile = {
  email: string,
  name: string,
};

class App extends Component<any, IAppState> {

  constructor(props: any) {
    super(props);

    this.state = {
      processing: false,
      alert: null,
      fileLoaded: false,
    };
  }

  async process() {
    const f = document.getElementById('mboxFile')! as HTMLInputElement;
    if (!f.files || !f.files[0]) return;
    const file = f.files[0];
    let emails: emailFile[] = [];
    let emailsSize = 0;


    if (await mbox.looksLikeMbox(file) == false) {
      this.setState({ alert: "This file does not look like a .mbox!!!" });
      console.warn("This file does not look like a .mbox!!!");
      return;
    }

    this.setState({ processing: true });
    await mbox.readMboxFile(file, async (m) => {
      const email = mbox.buildEml(m);
      emails.push({ email: email, name: this.safeFilename(m.subject, m.index) });
      emailsSize += new TextEncoder().encode(email).byteLength;
      if (emailsSize > compressSizeLimit) {
        const batch = emails;
        emails = [];
        emailsSize = 0;

        await this.genZip(batch, file.name);
      }
    });

    if (emails.length > 0) {
      await this.genZip(emails, file.name);
    }

    this.setState({ processing: 'done' });
  }

  /* Turn an email subject (or any string) into a safe filename. */
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

  private async genZip(emails: emailFile[], name: string) {
    const zip = new JSZip();
    const _name = name.substring(0, name.length - '.mbox'.length);

    // Add email (.eml) files
    emails.forEach((email) => {
      zip.file(email.name, email.email);
    });

    // Compress and ZIP
    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 4 }
    });

    // Trigger the download
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${_name}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  render() {
    return <Container>
      <Row><Col>
        <br />
        <Card>
          <Card.Title style={{ textAlign: 'center' }}>
            <h2>.MBOX to .EML</h2>
          </Card.Title>
          <Card.Body style={{ textAlign: 'center' }}>
            Hi! Upload a .mbox file! A zip file containing the emails in .eml format will be generated.
          </Card.Body>
        </Card>
        <br />
        {this.state.alert &&
          <Alert
            variant='danger'
            onClose={() => this.setState({ alert: null })} dismissible>
            {this.state.alert}
          </Alert>
        }
        <br />
        <Card>
          <input type="file" id="mboxFile" accept=".mbox"
            onChange={(e) => {
              const input = e.target as HTMLInputElement;
              this.setState({ fileLoaded: (input.files != null && input.files.length > 0) },
                () => { if (this.state.fileLoaded) this.setState({ processing: false }) });
            }} />
          <br />
          <Button
            onClick={() => this.process()}
            disabled={!this.state.fileLoaded || this.state.processing == 'done'}>
            {this.state.processing === true &&
              <Spinner animation="border" as="span" size="sm" role="status" aria-hidden="true" />}
            {this.state.processing == 'done' ? 'Processed!'
              : this.state.processing === true ? 'Processing'
                : 'Process'}
          </Button>
        </Card>
      </Col></Row>
    </Container>
  }

}

export default App
