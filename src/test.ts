const cwd = "/home/thetanav/Code/minis";
async function main() {
  const proc = Bun.spawn({
    cmd: ["ls", "-la"], // important
    cwd,
  });
  console.log(await proc.stdout.text());
  //   console.log(
  //     await proc.stdout
  //       .getReader()
  //       .read()
  //       .then(({ value }) => new TextDecoder().decode(value)),
  //   );
}
main();
