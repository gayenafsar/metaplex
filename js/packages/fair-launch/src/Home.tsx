import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import Countdown from "react-countdown";
import { Box, CircularProgress, Slider, Snackbar } from "@material-ui/core";
import Stepper from '@material-ui/core/Stepper';
import Step from '@material-ui/core/Step';
import StepLabel from '@material-ui/core/StepLabel';
import StepContent from '@material-ui/core/StepContent';
import Button from '@material-ui/core/Button';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';

import Alert from "@material-ui/lab/Alert";

import * as anchor from "@project-serum/anchor";

import { LAMPORTS_PER_SOL } from "@solana/web3.js";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletDialogButton } from "@solana/wallet-adapter-material-ui";

import {
  awaitTransactionSignatureConfirmation,
  getCandyMachineState,
  mintOneToken,
  shortenAddress,
} from "./candy-machine";

import {
  FairLaunchState,
  getFairLaunchState,
  purchaseTicket,
  withdrawFunds
} from "./fair-launch";

import { AnchorProgram, formatNumber, toDate } from './utils';

const ConnectButton = styled(WalletDialogButton)``;

const CounterText = styled.span``; // add your styles here

const MintContainer = styled.div``; // add your styles here

const MintButton = styled(Button)``; // add your styles here


function getStepContent(step: number, min?: number, max?: number) {
  switch (step) {
    case 0:
      return 'We are preparing for fair launch please wait for countdown to finish.';
    case 1:
      return `Welcome to Fair Launch Registration phase.
              During this phase of fair launch, you can bid SOL funds between ${min || 0} and ${max || 0}.
              Once phase ends median price will be calculated to decide a price of this mint.
              If you don't like that price you will be able to withdraw your bid.`;
    case 2:
      return 'An ad group contains one or more ads which target a shared set of keywords.';
    case 3:
      return 'An ad group contains one or more ads which target a shared set of keywords.';
    case 4:
      return `Try out different ad text to see what brings in the most customers,
              and learn how to enhance your ads using features like ad extensions.
              If you run into any problems with your ads, find out how to tell if
              they're running and how to resolve approval issues.`;
    default:
      return 'Unknown step';
  }
}


interface TabPanelProps {
  children?: React.ReactNode;
  index: any;
  value: any;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box p={3}>
          <Typography>{children}</Typography>
        </Box>
      )}
    </div>
  );
}

export interface HomeProps {
  candyMachineId: anchor.web3.PublicKey;
  fairLaunchId: anchor.web3.PublicKey;
  config: anchor.web3.PublicKey;
  connection: anchor.web3.Connection;
  startDate: number;
  treasury: anchor.web3.PublicKey;
  txTimeout: number;
}

const Home = (props: HomeProps) => {
  const [balance, setBalance] = useState<number>();
  const [isActive, setIsActive] = useState(false); // true when countdown completes
  const [isSoldOut, setIsSoldOut] = useState(false); // true when items remaining is zero
  const [isMinting, setIsMinting] = useState(false); // true when user got to press MINT
  const [contributed, setContributed] = useState(0);
  const [selectedTab, setSelectedTab] = useState(0);
  const wallet = useWallet();

  const anchorWallet = useMemo(() => {
    if (
      !wallet ||
      !wallet.publicKey ||
      !wallet.signAllTransactions ||
      !wallet.signTransaction
    ) {
      return;
    }

    return {
      publicKey: wallet.publicKey,
      signAllTransactions: wallet.signAllTransactions,
      signTransaction: wallet.signTransaction,
    } as anchor.Wallet;
  }, [wallet, wallet.publicKey]);

  const onTabChange = (event: React.ChangeEvent<{}>, newValue: number) => {
    setSelectedTab(newValue);
  };

  const [alertState, setAlertState] = useState<AlertState>({
    open: false,
    message: "",
    severity: undefined,
  });

  const [fairLaunchState, setFairLaunchState] = useState<FairLaunchState>();
  const [startDate, setStartDate] = useState(new Date(props.startDate));
  const [candyMachine, setCandyMachine] = useState<AnchorProgram>();

  const onMint = async () => {
    try {
      setIsMinting(true);
      if (wallet.connected && candyMachine?.program && wallet.publicKey) {
        const mintTxId = await mintOneToken(
          candyMachine,
          props.config,
          wallet.publicKey,
          props.treasury
        );

        const status = await awaitTransactionSignatureConfirmation(
          mintTxId,
          props.txTimeout,
          props.connection,
          "singleGossip",
          false
        );

        if (!status?.err) {
          setAlertState({
            open: true,
            message: "Congratulations! Mint succeeded!",
            severity: "success",
          });
        } else {
          setAlertState({
            open: true,
            message: "Mint failed! Please try again!",
            severity: "error",
          });
        }
      }
    } catch (error: any) {
      // TODO: blech:
      let message = error.msg || "Minting failed! Please try again!";
      if (!error.msg) {
        if (error.message.indexOf("0x138")) {
        } else if (error.message.indexOf("0x137")) {
          message = `SOLD OUT!`;
        } else if (error.message.indexOf("0x135")) {
          message = `Insufficient funds to mint. Please fund your wallet.`;
        }
      } else {
        if (error.code === 311) {
          message = `SOLD OUT!`;
          setIsSoldOut(true);
        } else if (error.code === 312) {
          message = `Minting period hasn't started yet.`;
        }
      }

      setAlertState({
        open: true,
        message,
        severity: "error",
      });
    } finally {
      if (wallet?.publicKey) {
        const balance = await props.connection.getBalance(wallet?.publicKey);
        setBalance(balance / LAMPORTS_PER_SOL);
      }
      setIsMinting(false);
    }
  };

  useEffect(() => {
    (async () => {
      if (wallet?.publicKey) {
        try {
          const balance = await props.connection.getBalance(wallet.publicKey);
          setBalance(balance / LAMPORTS_PER_SOL);
        } catch {
          // ignore connection error
        }
      }
    })();
  }, [wallet, props.connection]);

  useEffect(() => {
    (async () => {
      if(!anchorWallet) {
        return;
      }

      try {
        const state = await getFairLaunchState(anchorWallet,
          props.fairLaunchId,
          props.connection
        );

        setFairLaunchState(state);

        console.log()
      } catch {
        console.log('Problem getting fair launch state');
      }

      try {
        const { candyMachine, goLiveDate, itemsRemaining } =
          await getCandyMachineState(
            anchorWallet,
            props.candyMachineId,
            props.connection
          );
        setIsSoldOut(itemsRemaining === 0);
        setStartDate(goLiveDate);
        setCandyMachine(candyMachine);
        } catch {
          console.log('Problem getting candy machine state');
        }
    })();
  }, [anchorWallet, props.candyMachineId, props.connection]);

  const min = formatNumber.asNumber(fairLaunchState?.data.priceRangeStart);
  const max = formatNumber.asNumber(fairLaunchState?.data.priceRangeEnd);
  const step = formatNumber.asNumber(fairLaunchState?.data.tickSize);
  const median = formatNumber.asNumber(fairLaunchState?.currentMedian);
  const marks = [
    {
      value: min || 0,
      label: `${min} SOL`,
    },
    // TODO:L
    {
      value: median || 0,
      label: `${median}`,
    },
    // display user comitted value
    // {
    //   value: 37,
    //   label: '37°C',
    // },
    {
      value: max || 0,
      label: `${max} SOL`,
    },
  ].filter(_ => _ !== undefined && _.value !== 0) as any;

  const actionRender = (title: string, onClick: () => void) => {
    return <>
      <Slider
        min={min}
        marks={marks}
        max={max}
        step={step}
        value={contributed}
        onChange={(ev, val) => setContributed(val as any)}
        valueLabelDisplay="auto"
        style={{ width: 200, marginLeft: 20 }} />
      <p>Balance: {balance?.toFixed(2) || '--'} SOL</p>

      <MintButton
        onClick={onClick}
        variant="contained"
      >
        {title}
      </MintButton>
    </>
  }

  const onDeposit = () => {
    if (!anchorWallet) {
      return;
    }

    console.log('deposit');

    purchaseTicket(
      contributed,
      anchorWallet,
      fairLaunchState
    );
  };

  const onWithdraw = () => {
    if (!anchorWallet) {
      return;
    }

    console.log('withdraw');

    withdrawFunds(
      contributed,
      anchorWallet,
      fairLaunchState
    );
  };

  return (
    <main>
      <Grid container spacing={3}>
        <Grid item md={6}>
          <Paper>
            <Tabs
              value={selectedTab}
              onChange={onTabChange}
              indicatorColor="primary"
              textColor="primary"
              variant="scrollable"
              scrollButtons="auto"
              aria-label="scrollable auto tabs example"
            >
              <Tab label="Deposit" />
              <Tab label="Withdraw" />
            </Tabs>
            <TabPanel value={selectedTab} index={0}>
              {actionRender('Deposit', onDeposit)}
            </TabPanel>
            <TabPanel value={selectedTab} index={1}>
              {actionRender('Withdraw', onWithdraw)}
            </TabPanel>

            <p>Phase 1 starts at: {toDate(fairLaunchState?.data.phaseOneStart)?.toString()}</p>
            <p>Phase 1 ends at: {toDate(fairLaunchState?.data.phaseOneEnd)?.toString()}</p>
            <p>Phase 2 ends at: {toDate(fairLaunchState?.data.phaseTwoEnd)?.toString()}</p>

            <p>Current median price: {formatNumber.format(median)}</p>

            <p>Total raised</p>
            <p>Your contribution</p>
          </Paper>
        </Grid>
      </Grid>

      <p>GO LIVE: {startDate.toString()}</p>
      <p>TODO: add timer</p>

      {wallet.connected && (
        <p>Address: {shortenAddress(wallet.publicKey?.toBase58() || "")}</p>
      )}

      {wallet.connected && (
        <p>Balance: {(balance || 0).toLocaleString()} SOL</p>
      )}

      <MintContainer>
        {!wallet.connected ? (
          <ConnectButton>Connect Wallet</ConnectButton>
        ) : (
          <MintButton
            disabled={isSoldOut || isMinting || !isActive}
            onClick={onMint}
            variant="contained"
          >
            {isSoldOut ? (
              "SOLD OUT"
            ) : isActive ? (
              isMinting ? (
                <CircularProgress />
              ) : (
                "MINT"
              )
            ) : (
              <Countdown
                date={startDate}
                onMount={({ completed }) => completed && setIsActive(true)}
                onComplete={() => setIsActive(true)}
                renderer={renderCounter}
              />
            )}
          </MintButton>
        )}
      </MintContainer>

      <Snackbar
        open={alertState.open}
        autoHideDuration={6000}
        onClose={() => setAlertState({ ...alertState, open: false })}
      >
        <Alert
          onClose={() => setAlertState({ ...alertState, open: false })}
          severity={alertState.severity}
        >
          {alertState.message}
        </Alert>
      </Snackbar>
    </main>
  );
};

interface AlertState {
  open: boolean;
  message: string;
  severity: "success" | "info" | "warning" | "error" | undefined;
}

const renderCounter = ({ days, hours, minutes, seconds, completed }: any) => {
  return (
    <CounterText>
      {hours} hours, {minutes} minutes, {seconds} seconds
    </CounterText>
  );
};

export default Home;
