import Head from 'next/head';

export default function Home() {
  return (
    <>
      <Head>
        <title>RaDIM</title>
      </Head>
      <iframe src="/index.html" width="100%" height="100vh" style={{ border: "none" }}></iframe>
    </>
  );
}