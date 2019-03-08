// @flow
import React, { Component } from 'react';
import { observer } from 'mobx-react';
import { defineMessages, intlShape } from 'react-intl';
import classnames from 'classnames';
import { Button } from 'react-polymorph/lib/components/Button';
import { ButtonSkin } from 'react-polymorph/lib/skins/simple/ButtonSkin';
import { Input } from 'react-polymorph/lib/components/Input';
import { InputSkin } from 'react-polymorph/lib/skins/simple/InputSkin';
import { TextArea } from 'react-polymorph/lib/components/TextArea';
import { TextAreaSkin } from 'react-polymorph/lib/skins/simple/TextAreaSkin';
import cbor from 'cbor';
import scrypt from 'scryptsy';
import BorderedBox from '../widgets/BorderedBox';
import ReactToolboxMobxForm from '../../utils/ReactToolboxMobxForm';
import FileUploadWidget from '../widgets/forms/FileUploadWidget';
import LoadingSpinner from '../widgets/LoadingSpinner';
import styles from './WalletImporter.scss';
import { FORM_VALIDATION_DEBOUNCE_WAIT } from '../../config/timingConfig';
import { encryptPassphrase } from '../../api/utils';
// import { scryptSync } from 'crypto';

export const messages = defineMessages({
  headline: {
    id: 'wallet.importer.headline',
    defaultMessage: '!!!Wallet importer',
    description: 'Headline of the wallet importer page.',
  },
  instructions: {
    id: 'wallet.importer.instructions',
    defaultMessage: '!!!In order to import wallets select a secrets key file.',
    description: 'Detailed instructions for importing wallets.',
  },
  keyFileLabel: {
    id: 'wallet.importer.keyFileLabel',
    defaultMessage: '!!!Secrets key file',
    description: 'Label "Secrets key file" on the wallet importer page.'
  },
  keyFileHint: {
    id: 'wallet.importer.keyFileHint',
    defaultMessage: '!!!Drop your "secret.key" file here or click to choose',
    description: 'Hint for the secrets key file upload field on the wallet importer page.'
  },
  passwordsListLabel: {
    id: 'wallet.importer.passwordsListLabel',
    defaultMessage: '!!!Passwords list',
    description: 'Label "Passwords list" on the wallet importer page.'
  },
  passwordsListHint: {
    id: 'wallet.importer.passwordsListHint',
    defaultMessage: '!!!Enter your potential wallet passwords line by line',
    description: 'Hint for the passwords list field on the wallet importer page.'
  },
  submitLabel: {
    id: 'wallet.importer.submitLabel',
    defaultMessage: '!!!Analyse passwords',
    description: 'Label for the "Analyse passwords" submit button on the wallet importer page.'
  },
});

type Props = {};

type State = {
  isExtractingWallets: boolean,
  isSubmitting: boolean,
  // wallets: Array<{ index: number, passwordHash: string }>,
};

@observer
export default class WalletImporter extends Component<Props, State> {

  static contextTypes = {
    intl: intlShape.isRequired,
  };

  state = {
    isExtractingWallets: false,
    isSubmitting: false,
    // wallets: [],
  };

  form = new ReactToolboxMobxForm({
    fields: {
      keyFile: {
        label: this.context.intl.formatMessage(messages.keyFileLabel),
        placeholder: this.context.intl.formatMessage(messages.keyFileHint),
        type: 'file',
      },
      passwords: {
        label: this.context.intl.formatMessage(messages.passwordsListLabel),
        placeholder: this.context.intl.formatMessage(messages.passwordsListHint),
        value: '',
      },
      walletHashes: {
        value: [],
      },
      confirmedPasswordHashes: {
        value: [],
      },
    },
  }, {
    options: {
      validateOnChange: true,
      validationDebounceWait: FORM_VALIDATION_DEBOUNCE_WAIT,
    },
  });

  submit = () => {
    const { form } = this;
    const passwordsField = form.$('passwords');
    console.log(passwordsField.value);
    this.setState({ isSubmitting: true });
    setTimeout(() => {
      this.testPassword(passwordsField.value);
    }, 100);
  };

  checkPassword(passphraseHash: string, passhash: Buffer) {
    const bits = passphraseHash.split('|');
    const logN = parseInt(bits[0], 10);
    const r = parseInt(bits[1], 10);
    const p = parseInt(bits[2], 10);
    const salt = Buffer.from(bits[3], 'base64');
    const realhash = Buffer.from(bits[4], 'base64');

    // from nodejs native crypto (which is missing in renderer proc)
    // var hash2 = scryptSync(cbor.encode(passhash), salt, 32, { N: 2 ** logN, r: r, p: p });
    // try the scryptsy from npm (works, but worse performance)
    const hash2 = scrypt(cbor.encode(passhash), salt, 2 ** logN, r, p, 32);
    return realhash.equals(hash2);
  }

  testPassword(password: string) {
    const { form } = this;
    const walletHashesField = form.$('walletHashes');
    const confirmedPasswordHashesField = form.$('confirmedPasswordHashes');

    let testpasshash = null;
    if (password === '') testpasshash = Buffer.from([]);
    else testpasshash = Buffer.from(encryptPassphrase(password), 'hex');

    for (let idx = 0; idx < walletHashesField.value.length; idx++) {
      if (this.checkPassword(walletHashesField.value[idx].pwhash, testpasshash)) {
        console.log('wallet idx', idx, 'has password', password);
        const oldhashes = confirmedPasswordHashesField.value;
        oldhashes[idx] = testpasshash.toString('hex');
        confirmedPasswordHashesField.set(oldhashes);
      }
    }

    this.setState({ isSubmitting: false });
  }

  extractKey(idx: number) {
    const { form } = this;
    const walletHashesField = form.$('walletHashes');
    const input = walletHashesField.value[idx];
    // the WalletUserSecret
    const wus = [];
    wus[0] = input.raw;
    wus[1] = 'extracted key#' + idx;
    wus[2] = []; // accounts
    wus[3] = []; // addresses
    // the UserSecret
    const newSecrets = cbor.encode([[], [], [], [wus]]);
    return newSecrets;
  }

  render() {
    const { intl } = this.context;
    const { isSubmitting, isExtractingWallets } = this.state;
    const { form, submit } = this;
    const keyFileField = form.$('keyFile');
    const passwordsField = form.$('passwords');

    const walletHashesField = form.$('walletHashes');
    const confirmedPasswordHashesField = form.$('confirmedPasswordHashes');

    function generateWalletList() {
      const knownHashes = confirmedPasswordHashesField.value;
      const x = [];
      for (let idx = 0; idx < knownHashes.length; idx++) {
        x.push(
          <div className={styles.walletRow}>
            <Input label={!idx ? 'Wallet file' : null} value={`wallet-${idx}.key`} skin={InputSkin} readOnly />
            <Input label={!idx ? 'Password' : null} placeholder="unknown password" skin={InputSkin} readOnly />
            <Input label={!idx ? 'Balance' : null} placeholder="unknown balance" skin={InputSkin} readOnly />
            <Button
              className={styles.importButton}
              label="Import"
              disabled
              skin={ButtonSkin}
            />
          </div>
        );
        if (knownHashes[idx] == null) {
          console.log('wallet#' + idx + ' has unknown pw');
        } else {
          console.log('wallet#' + idx + ' has pw hash ' + knownHashes[idx]);
          console.log(this.extractKey(idx));
        }
      }
      return x;
    }

    const submitButtonClasses = classnames([
      'primary',
      isSubmitting ? styles.submitButtonSpinning : styles.submitButton,
    ]);

    return (
      <div className={styles.component}>

        <BorderedBox>

          <h2 className={styles.headline}>{intl.formatMessage(messages.headline)}</h2>

          <div className={styles.instructions}>
            <p>{intl.formatMessage(messages.instructions)}</p>
          </div>

          <div className={styles.fileUpload}>
            <FileUploadWidget
              {...keyFileField.bind()}
              selectedFile={keyFileField.value}
              showSelectedFilePath
              acceptedFileTypes=".key"
              onFileSelected={(file) => {
                // "set(value)" is an unbound method and thus must be explicitly called
                keyFileField.set(file);

                this.setState({ isExtractingWallets: true });

                // from https://react-dropzone.netlify.com/
                const reader = new FileReader();
                reader.onabort = () => console.log('file reading was aborted');
                reader.onerror = () => console.log('file reading has failed');
                reader.onload = () => {
                  const binaryStr = Buffer.from(reader.result);
                  const decodedSecrets = cbor.decode(binaryStr);
                  const keys = decodedSecrets[2];
                  const walletHashes = [];
                  const pwhashes = [];
                  for (let x = 0; x < keys.length; x++) {
                    walletHashes[x] = { raw: keys[x], pwhash: keys[x][1].toString('ascii') };
                    pwhashes[x] = null;
                  }
                  walletHashesField.set(walletHashes);
                  confirmedPasswordHashesField.set(pwhashes);
                  this.testPassword('');
                  this.setState({ isExtractingWallets: false });
                };

                setTimeout(() => {
                  reader.readAsArrayBuffer(file);
                }, 100);
              }}
            />
          </div>

          {isExtractingWallets ? (
            <div className={styles.extractingWalletsWrapper}>
              <LoadingSpinner big />
              <p className={styles.extractingWalletsText}>
                Extracting wallets
              </p>
            </div>
          ) : null}

          {keyFileField.value && walletHashesField.value.length ? (
            <div>
              <div className={styles.walletRows}>
                {generateWalletList.apply(this)}
              </div>

              <TextArea
                {...passwordsField.bind()}
                rows={5}
                skin={TextAreaSkin}
              />

              <Button
                className={submitButtonClasses}
                label={intl.formatMessage(messages.submitLabel)}
                onClick={submit}
                skin={ButtonSkin}
              />
            </div>
          ) : null}

        </BorderedBox>

      </div>
    );
  }

}
