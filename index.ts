import dotenv from "dotenv";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import axios from "axios";
import { Jupiter, RouteInfo, TOKEN_LIST_URL } from "@jup-ag/core";
dotenv.config();

const connection = new Connection(process.env.RPC_URL!);
const keypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.PRIVATE_KEY!))
);

const USDC = "Es9vMFrzaCERNGMZ7VCtVbLvz6f9gPbbhBikzHKvHPxX";
const SOL = "So11111111111111111111111111111111111111112";
const SLIPPAGE = 1;
const AMOUNT = 1 * 10 ** 6;

let jupiter: Jupiter;

const setupJupiter = async () => {
  const res = await axios.get(TOKEN_LIST_URL["mainnet-beta"]);
  const tokens = res.data;

  jupiter = await Jupiter.load({
    connection,
    cluster: "mainnet-beta",
    user: keypair,
    routeCacheDuration: 0,
    tokens,
  });
};

const executeSwap = async (route: RouteInfo) => {
  const { execute } = await jupiter.exchange({
    route,
    userPublicKey: keypair.publicKey,
    wrapUnwrapSOL: true,
  });

  const txid = await execute();
  console.log("✅ Transaction sent! TxID:", txid);
};

const checkArbitrage = async (): Promise<void> => {
  console.log("🔍 Checking for arbitrage...");

  const routesToSOL = await jupiter.computeRoutes({
    inputMint: new PublicKey(USDC),
    outputMint: new PublicKey(SOL),
    amount: AMOUNT,
    slippage: SLIPPAGE,
    forceFetch: true,
  });

  if (!routesToSOL.routesInfos.length) return;
  const forward = routesToSOL.routesInfos[0];

  const reverseAmount = forward.outAmount;
  const routesToUSDC = await jupiter.computeRoutes({
    inputMint: new PublicKey(SOL),
    outputMint: new PublicKey(USDC),
    amount: reverseAmount,
    slippage: SLIPPAGE,
    forceFetch: true,
  });

  if (!routesToUSDC.routesInfos.length) return;
  const backward = routesToUSDC.routesInfos[0];

  const returnAmount = backward.outAmount;
  const profit = returnAmount - AMOUNT;

  console.log(`Forward: USDC -> SOL => Got ${reverseAmount / 1e9} SOL`);
  console.log(`Backward: SOL -> USDC => Got ${returnAmount / 1e6} USDC`);
  console.log(`Profit: ${profit / 1e6} USDC`);

  if (profit > 0) {
    console.log("🚀 Arbitrage opportunity found! Executing swap...");
    await executeSwap(forward);
  } else {
    console.log("❌ No profitable arbitrage found.");
  }
};

const startBotLoop = async () => {
  await setupJupiter();
  while (true) {
    try {
      await checkArbitrage();
    } catch (e: any) {
      console.error("❌ Error in bot:", e.message);
    }
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
};

(async () => {
  await startBotLoop();
})();
