function openChatbox()
    % Load or create user token (hidden identifier) - was gonna use this to
    % build a backend database of prompts so ai could build up on previous
    % prompts and work through problems (perhaps someone could extend it to
    % have this functionality)
    if isfile('user_token.mat')
        load('user_token.mat', 'token');
    else
        token = char(java.util.UUID.randomUUID); %Get ur random token
        save('user_token.mat', 'token');
    end

    % Create floating UI
    fig = uifigure('Name', 'Bloxi Chat', ...
                   'Position', [100, 100, 320, 450]);

    % ----------------------------------------------------------------------------
    % 1) Chat display area
    % ----------------------------------------------------------------------------
    chatArea = uitextarea(fig, 'Position', [10, 110, 300, 300], 'Editable', 'off','Value', {'[Simulink Copilot Chat Ready...]'});

    % ----------------------------------------------------------------------------
    % 2) Input field, Send, and Debug buttons
    % ----------------------------------------------------------------------------
    inputField = uieditfield(fig, 'text', 'Position', [10, 70, 160, 30]);
    sendBtn = uibutton(fig, 'Text', 'Send', 'Position', [180, 70, 60, 30], ...
        'ButtonPushedFcn', @(btn,event) sendMessage());
    debugBtn = uibutton(fig, 'Text', 'Debug', 'Position', [250, 70, 60, 30], ...
        'ButtonPushedFcn', @(btn,event) debugModel());

    % ----------------------------------------------------------------------------
    % 3) Send message handler
    % ----------------------------------------------------------------------------
    function sendMessage()
        msg = strtrim(inputField.Value);
        if isempty(msg)
            return;
        end
        inputField.Value = '';

        % Gives you a 'You': prefix
        chatArea.Value{end+1} = ['You: ', msg];

        % Prepare payload and send to /chat
        data = struct('token', token, 'user_input', msg);
        options = weboptions('MediaType', 'application/json', 'Timeout', 60);
        try
            response = webwrite('http://localhost:3000/chat', data, options);
        catch err
            chatArea.Value{end+1} = ['Bot: Could not contact backend'];
            disp(err.message);
            return;
        end

        % Gives you a 'Bot': prefix
        chatArea.Value{end+1} = ['Bot: ', response.reply];

        % If model response is good it'll build in Simulink
        if isfield(response, 'type') && strcmp(response.type, 'model') && ...
           isfield(response, 'model_data') && ...
           (isfield(response.model_data, 'blocks') || isfield(response.model_data, 'connections'))

            chatArea.Value{end+1} = '[Building model in Simulink...]';
            try
                buildSimulinkModel(response.model_data, chatArea);
            catch buildErr
                chatArea.Value{end+1} = '[⚠️ Error building model in Simulink]';
                disp(buildErr.message);
                return;
            end
        end
    end

    % ----------------------------------------------------------------------------
    % 4) Debug handler 
    % ----------------------------------------------------------------------------
    function debugModel()
        % Check if user has typed a problem description
        problem = strtrim(inputField.Value); %Reduce the input tokens (tryns save some p's)
        if isempty(problem)
            % Tell them a description of the prompt is requiredd innih
            chatArea.Value{end+1} = ['Bot: Please describe the issue you want to debug.'];
            return;
        end

        % Append "You:" with problem description
        inputField.Value = ''; %Clears the input field
        chatArea.Value{end+1} = ['You (debug): ', problem];

        % Identify current model
        mdl = gcs; %Originally bdroot for top-level but if in a subsystem use gcs and it'll capture that instead...
        if isempty(mdl)
            chatArea.Value{end+1} = ['Bot: No Simulink model is open to debug.'];
            return;
        end

        % Zoom out to show entire model
        try
            set_param(mdl, 'Zoom', 'FitSystem');
            pause(0.5);
        catch
            % ignore if fails
        end

        % Capture screenshot to a temporary PNG <- given the code isn't
        % shown or accessible alternative was to move through your simulink
        % file and take screenshots and run this through the LLM to
        % identify errors and inconcistency
        tempFile = fullfile(tempdir, ['bloxi_debug_' char(java.util.UUID.randomUUID) '.png']);
        try
            print(['-s' mdl], '-dpng', tempFile);
        catch
            try
                saveas(find_system(mdl, 'SearchDepth', 0), tempFile);
            catch
                chatArea.Value{end+1} = ['Bot: ⚠️ Unable to capture screenshot.'];
                return;
            end
        end

        chatArea.Value{end+1} = ['Bot: Alright, let me take a look at your model...'];

        % Read and base64-encode the image - found out thats how p
        try
            fid = fopen(tempFile, 'rb');
            imgBytes = fread(fid, inf, '*uint8');
            fclose(fid);
            b64 = matlab.net.base64encode(imgBytes);
        catch
            chatArea.Value{end+1} = ['Bot: ⚠️ Failed to read screenshot file.'];
            delete(tempFile);
            return;
        end

        % Prepare payload: include token, problem description, and image
        payload = struct();
        payload.token       = token;
        payload.problem     = problem;
        payload.debug_img   = b64;
        body = jsonencode(payload);

        opts = weboptions('MediaType', 'application/json', 'Timeout', 60);
        try
            debugResp = webwrite('http://localhost:3000/debug', body, opts);
        catch err
            chatArea.Value{end+1} = ['Bot: ⚠️ Debug request failed.'];
            disp(err.message);
            delete(tempFile);
            return;
        end

        % Display server’s debug reply
        if isfield(debugResp, 'reply')
            chatArea.Value{end+1} = ['Bot: ', debugResp.reply];
        end
        if isfield(debugResp, 'follow_up')
            chatArea.Value{end+1} = ['Bot: ', debugResp.follow_up];
        end

        % Cleanup temporary file
        if exist(tempFile, 'file')
            delete(tempFile);
        end
    end

end
