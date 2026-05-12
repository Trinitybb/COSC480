// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract FakeMoney {
    string public constant name = "CampusFakeUSD";
    string public constant symbol = "CFUSD";
    uint8 public constant decimals = 2;

    address public owner;
    uint256 public totalSupply;

    mapping(address => uint256) private balances;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(uint256 initialSupply) {
        owner = msg.sender;
        _mint(msg.sender, initialSupply);
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    // Platform-level transfer for classroom/demo use.
    function adminTransfer(address from, address to, uint256 amount) external onlyOwner returns (bool) {
        _transfer(from, to, amount);
        return true;
    }

    function mint(address to, uint256 amount) external onlyOwner returns (bool) {
        _mint(to, amount);
        return true;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero owner");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "Zero recipient");
        require(amount > 0, "Amount must be > 0");
        require(balances[from] >= amount, "Insufficient balance");

        unchecked {
            balances[from] -= amount;
            balances[to] += amount;
        }

        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        require(to != address(0), "Zero recipient");
        require(amount > 0, "Amount must be > 0");

        totalSupply += amount;
        balances[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
