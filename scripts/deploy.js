async function main() {
    const FakeMoney = await ethers.getContractFactory("FakeMoney");
    const decimals = 2;
    const initialSupply = ethers.utils.parseUnits("1000000", decimals); // 1,000,000.00

    const fakeMoney = await FakeMoney.deploy(initialSupply);
    await fakeMoney.deployed();

    console.log("FakeMoney deployed to address:", fakeMoney.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
