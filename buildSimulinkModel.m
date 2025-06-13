function buildSimulinkModel(modelData, chatArea)
    % Use currently open model
    modelName = bdroot;
    if isempty(modelName)
        uialert(chatArea.Parent, 'No Simulink model is currently open.', 'Bloxi Error');
        return;
    end
    open_system(modelName);

    % Helper to check if a path refers to a Sum block
    function isSum = isSumBlock(btype)
        isSum = strcmpi(btype, 'Sum');
    end

    % Helper to check if a path refers to a Scope block
    function isScope = isScopeBlock(btype)
        isScope = strcmpi(btype, 'Scope') || strcmpi(btype, 'Spectrum Scope');
    end

    % Step 1: Add all blocks, applying extra port settings if present
    if isfield(modelData, 'blocks')
        blocks = modelData.blocks;
        for i = 1:length(blocks)
            if iscell(blocks)
                blk = blocks{i};
            else
                blk = blocks(i);
            end

            chatArea.Value{end+1} = ['[Adding: ', blk.name, ']'];

            % Determine Position
            if isfield(modelData, 'layout') && isfield(modelData.layout, blk.name)
                xy = modelData.layout.(blk.name);
                x = xy(1); y = xy(2);
                pos = [x, y, x + 40, y + 50];
            else
                pos = [40*i, 100, 40*i + 30, 150];
            end

            % 1a) Add the block
            try
                add_block(['simulink/Commonly Used Blocks/', blk.type], ...
                          [modelName, '/', blk.name], ...
                          'Position', pos);
            catch
                chatArea.Value{end+1} = ['[⚠️ Could not add block: ', blk.name, ']'];
                continue; % skip further setup for this block
            end

            % 1b) If it's a Sum block with an "inputs" property, reconfigure ports
            if isfield(blk, 'inputs') && isSumBlock(blk.type)
                % e.g. blk.inputs = "+++-"
                try
                    set_param([modelName, '/', blk.name], 'Inputs', blk.inputs);
                    chatArea.Value{end+1} = ['[Configured Sum inputs: ', blk.inputs, ']'];
                catch
                    chatArea.Value{end+1} = ['[⚠️ Could not set Sum inputs for: ', blk.name, ']'];
                end
            end

            % 1c) If it's a Scope block with a "numInputs" property, reconfigure
            if isfield(blk, 'numInputs') && isScopeBlock(blk.type)
                % e.g. blk.numInputs = 2
                try
                    set_param([modelName, '/', blk.name], 'NumInputPorts', num2str(blk.numInputs));
                    chatArea.Value{end+1} = ['[Configured Scope inputs: ', num2str(blk.numInputs), ']'];
                catch
                    chatArea.Value{end+1} = ['[⚠️ Could not set Scope inputs for: ', blk.name, ']'];
                end
            end

            % 1d) If the block has a "value" (e.g. Gain, Constant), set its parameter
            if isfield(blk, 'value')
                try
                    set_param([modelName, '/', blk.name], 'Gain', blk.value);
                catch
                    try
                        set_param([modelName, '/', blk.name], 'Value', blk.value);
                    catch
                        % Not all blocks support Gain or Value; ignore
                    end
                end
            end

            pause(0.1);  % a short pause for visual effect
        end
    end

    % Step 2: Add connections (wiring)
    if isfield(modelData, 'connections')
        connections = modelData.connections;
        for i = 1:length(connections)
            if iscell(connections)
                conn = connections{i};
            else
                conn = connections(i);
            end

            % Auto‐fix missing ports if needed
            src = conn.src;
            dst = conn.dst;
            if ~contains(src, '/'), src = [src, '/1']; end
            if ~contains(dst, '/'), dst = [dst, '/1']; end

            chatArea.Value{end+1} = ['[Connecting: ', src, ' → ', dst, ']'];
            try
                add_line(modelName, src, dst, 'autorouting', 'on');
            catch
                chatArea.Value{end+1} = ['[⚠️ Failed to connect ', src, ' → ', dst, ']'];
            end

            pause(0.05);
        end
    end

    % Step 3: Apply any extra parameter modifications
    if isfield(modelData, 'modifications')
        mods = modelData.modifications;
        for i = 1:length(mods)
            if iscell(mods)
                mod = mods{i};
            else
                mod = mods(i);
            end

            try
                set_param([modelName, '/', mod.name], mod.param, mod.value);
                chatArea.Value{end+1} = ['[Modified ', mod.name, ': ', mod.param, ' = ', mod.value, ']'];
            catch
                chatArea.Value{end+1} = ['[⚠️ Failed to modify ', mod.name, ']'];
            end

            pause(0.05);
        end
    end

    % Final: Zoom to fit and signal done
    try
        set_param(modelName, 'ZoomFactor', 'FitSystem');
    catch
        % ignore if zoom fails
    end

    chatArea.Value{end+1} = '[Model update complete ✅]';
end

